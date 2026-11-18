// WS 网关：驱动协议的传输实现（ADR-0012 阶段三）。
// 每条连接维护订阅表：attach / create 成功即订阅该 sessionId 的协议事件，
// release / 断开即撤订；协议层错误一律走 error 帧，连接不断。
// deps 是 registry 的窄投影（attach/create/release/drive），组装层注入。
import type { Server } from "node:http";
import { errorMessage } from "@pi-studio/shared/errors";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type {
  ClientFrame,
  ContextUsageInfo,
  DriveCommand,
  DriveErrorCode,
  DriveEvent,
  InputDisposition,
  ServerFrame,
  SessionCatalog,
} from "@pi-studio/shared/protocol";
import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

/** drive 命令的处理结果（组装层产出）：ok 时 steer/followUp 携带 disposition；
 *  失败可带机器码，客户端据此走 i18n（ADR-0011） */
export type DriveOutcome =
  | { ok: true; disposition?: InputDisposition }
  | { ok: false; message: string; code?: DriveErrorCode };

/** 打开会话的返回值：sessionId + 内核当前快照 + 模型/命令目录与用量快照（ADR-0016）。
 *  快照只随 create 下发（attach 的会话已落盘，基线走 REST），目录与用量则两边都带 */
export interface OpenedSession {
  sessionId: string;
  snapshot(): SessionSnapshot;
  catalog(): SessionCatalog;
  usage(): ContextUsageInfo | undefined;
}

export interface WsGatewayDeps {
  attach(file: string): Promise<OpenedSession>;
  create(cwd: string): Promise<OpenedSession>;
  /** 已驱动会话按 sessionId 取回（同连接 attach 重放回 attached 帧，不开新宿主） */
  get(sessionId: string): OpenedSession | undefined;
  /** 按 attach 文件查 sessionId（重放幂等 / 僵尸属主判定用） */
  sessionOf(file: string): string | undefined;
  release(sessionId: string): void;
  drive(command: DriveCommand): Promise<DriveOutcome>;
}

export interface WsGateway {
  /** registry 侧事件入口：路由到订阅了该 sessionId 的连接 */
  emit(event: DriveEvent): void;
  /** 挂到 http server 的 upgrade 事件，只接受 /ws 路径 */
  bind(server: Server): void;
  close(): Promise<void>;
}

/** 心跳参数：interval 缺省 30s；isLive 可注入（僵尸接管语义单测用——
    ws 客户端自动应答 ping，真连接造不出「超期未应答」） */
export interface WsGatewayOptions {
  heartbeatMs?: number;
  isLive?(socket: WsSocket): boolean;
}

export function createWsGateway(deps: WsGatewayDeps, opts: WsGatewayOptions = {}): WsGateway {
  const wss = new WebSocketServer({ noServer: true });
  // sessionId → 订阅它的连接集合（emit 路由表）
  const subscriptions = new Map<string, Set<WsSocket>>();
  // sessionId → 属主连接：attach 幂等重放与僵尸接管都按它判定
  const owners = new Map<string, WsSocket>();
  // 心跳存活簿（pong 即刷新）：经代理的半开连接 close 可迟到数分钟，属主标记
  // 若只等 close 事件会一直卡住重连重放，故僵尸按心跳超期判定并接管
  const lastPong = new WeakMap<WsSocket, number>();
  const HEARTBEAT_MS = opts.heartbeatMs ?? 30_000;

  const isLive = (socket: WsSocket) =>
    opts.isLive ? opts.isLive(socket) : Date.now() - (lastPong.get(socket) ?? 0) < HEARTBEAT_MS * 2;

  function send(socket: WsSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  function claim(sessionId: string, socket: WsSocket): void {
    owners.set(sessionId, socket);
    let set = subscriptions.get(sessionId);
    if (!set) {
      set = new Set();
      subscriptions.set(sessionId, set);
    }
    set.add(socket);
  }

  function unsubscribe(sessionId: string, socket: WsSocket): void {
    const set = subscriptions.get(sessionId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) subscriptions.delete(sessionId);
  }

  function unclaim(sessionId: string, socket: WsSocket): void {
    if (owners.get(sessionId) === socket) owners.delete(sessionId);
    unsubscribe(sessionId, socket);
  }

  /** attached 帧统一出口：快照只随 create 下发（attach 的会话已落盘，基线走 REST，
      ADR-0012：读路径不变）；目录与用量（ADR-0016）两边都带——宿主构造期无订阅者，
      这两份初始状态只能随 attached 帧走，不能靠事件（同补记二的时序坑） */
  function sendAttached(socket: WsSocket, opened: OpenedSession, file?: string): void {
    const { sessionId } = opened;
    const snapshot = file === undefined ? opened.snapshot() : undefined;
    const catalog = opened.catalog();
    const usage = opened.usage();
    send(socket, {
      type: "attached",
      sessionId,
      ...(snapshot ? { header: snapshot.header, entries: snapshot.entries } : {}),
      ...(file ? { file } : {}),
      ...(catalog.model || catalog.commands ? { catalog } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  /** attach / create 共用骨架：打开 → 回 attached → 登记属主与订阅。
   *  attach 失败的 error 帧携 file 回显（Send-to-Attach 按它精确兑付，ADR-0012 补记十一） */
  async function openSubscription(
    socket: WsSocket,
    owned: Set<string>,
    open: () => Promise<OpenedSession>,
    file?: string,
  ): Promise<void> {
    try {
      const opened = await open();
      const { sessionId } = opened;
      owned.add(sessionId);
      claim(sessionId, socket);
      sendAttached(socket, opened, file);
    } catch (err) {
      // 机器码供客户端走 i18n（ADR-0011）；服务端文案仅作调试兜底
      const code = (err as { code?: DriveErrorCode }).code;
      send(socket, {
        type: "error",
        message: errorMessage(err),
        ...(code ? { code } : {}),
        ...(file ? { file } : {}),
      });
    }
  }

  async function handleFrame(socket: WsSocket, frame: ClientFrame, owned: Set<string>): Promise<void> {
    switch (frame?.type) {
      case "attach": {
        // 幂等与接管（use-drive 断线重连契约「attached 幂等保留已有条目」）：
        // 同连接重放 → 直接回 attached，不开新宿主；属主心跳超期（僵尸，close
        // 未及触达）→ 释放后重新打开；活着的其它连接属主 → 落回 registry.attach
        // 照常抛 sessionAlreadyDriven
        const existing = deps.sessionOf(frame.file);
        if (existing !== undefined) {
          const owner = owners.get(existing);
          if (owner === socket) {
            const opened = deps.get(existing);
            if (opened) {
              claim(existing, socket);
              sendAttached(socket, opened, frame.file);
              return;
            }
            deps.release(existing);
            owners.delete(existing);
          } else if (owner === undefined || !isLive(owner)) {
            deps.release(existing);
            owners.delete(existing);
            if (owner) unsubscribe(existing, owner);
          }
        }
        return openSubscription(socket, owned, () => deps.attach(frame.file), frame.file);
      }
      case "create":
        return openSubscription(socket, owned, () => deps.create(frame.cwd));
      case "release":
        deps.release(frame.sessionId);
        owned.delete(frame.sessionId);
        unclaim(frame.sessionId, socket);
        send(socket, { type: "released", sessionId: frame.sessionId });
        return;
      case "drive": {
        const { sessionId, body } = frame.command;
        try {
          const outcome = await deps.drive(frame.command);
          if (!outcome.ok) {
            // command 回带被拒命令类型：client 只让文本命令的待回显让位（ADR-0012 补记十二）
            send(socket, {
              type: "commandFailed",
              sessionId,
              message: outcome.message,
              command: body.type,
              ...(outcome.code ? { code: outcome.code } : {}),
            });
          } else if (outcome.disposition && (body.type === "steer" || body.type === "followUp")) {
            send(socket, { type: "disposition", sessionId, command: body.type, disposition: outcome.disposition });
          }
        } catch (err) {
          send(socket, { type: "commandFailed", sessionId, message: errorMessage(err), command: body.type });
        }
        return;
      }
      default:
        send(socket, { type: "error", message: "未知帧类型", code: "unknownFrame" });
    }
  }

  wss.on("connection", (socket) => {
    // 本连接拥有的订阅（断开时逐一撤销并释放属主）
    const owned = new Set<string>();
    lastPong.set(socket, Date.now());
    socket.on("pong", () => lastPong.set(socket, Date.now()));
    socket.on("message", (data) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(String(data)) as ClientFrame;
      } catch {
        send(socket, { type: "error", message: "无法解析的帧", code: "badFrame" });
        return;
      }
      void handleFrame(socket, frame, owned);
    });
    socket.on("close", () => {
      // 连接消亡即释放属主（ADR-0012：内存标记随生命周期消亡）；
      // 否则浏览器刷新后旧连接的标记残留，同一 session 将无法重新接管。
      // close 迟到的僵尸由心跳 terminate 后走到这里兜底。
      // 守卫：会话若已被别的连接接管（僵尸 close 迟到场景），不得释放新属主的会话
      for (const sessionId of owned) {
        if (owners.get(sessionId) === socket) {
          deps.release(sessionId);
          owners.delete(sessionId);
        }
        unsubscribe(sessionId, socket);
      }
    });
  });

  // 心跳巡检：存活者继续 ping，超期未应答的僵尸 terminate（随后 close 兜底清属主）
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (isLive(socket)) socket.ping();
      else socket.terminate();
    }
  }, HEARTBEAT_MS);

  return {
    emit(event) {
      const set = subscriptions.get(event.sessionId);
      if (!set) return;
      const frame: ServerFrame = { type: "event", event };
      for (const socket of set) send(socket, frame);
    },
    bind(server) {
      server.on("upgrade", (request, socket, head) => {
        const { pathname } = new URL(request.url ?? "/", "http://localhost");
        if (pathname !== "/ws") {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      });
    },
    close() {
      // 先硬断全部存活连接（含已退订的）：wss.close 的回调要等连接清空，否则宿主收尾悬挂
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

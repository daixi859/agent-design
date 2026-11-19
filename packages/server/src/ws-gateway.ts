// WS 网关：驱动协议的传输实现（ADR-0012 阶段三；C7 属主单表后降为纯路由 + 心跳传感器）。
// 每条连接维护订阅表：attach / create 成功即订阅该 sessionId 的协议事件，
// release / 断开即撤订；协议层错误一律走 error 帧，连接不断。
// 单客户端租约（ADR-0012 补记十六）：同一时刻只服务一个控制连接，后来者回 serverBusy 并关闭；
// 持有者心跳超期（僵尸）则先撤其属主再让位。
// 属主记账在 registry 单表（owner token = 连接对象，本模块只读判定与投喂存活）——
// 僵尸接管与迟到 close 的守卫由单表结构性保证，这里不再持有属主副本。
// deps 是 registry 的窄投影（attach/create/release/drive + 属主投影），组装层注入。
import type { Server } from "node:http";
import { errorMessage } from "@pi-studio/shared/errors";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type {
  ClientFrame,
  ContextUsageInfo,
  DriveCommand,
  DriveErrorCode,
  DriveEvent,
  DriveOutcome,
  ServerFrame,
  SessionCatalog,
} from "@pi-studio/shared/protocol";
import type { OwnerToken } from "@pi-studio/core";
import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

/** drive 命令的处理结果（ADR-0012 补记十七）：形状与语义归协议层（SessionHost.dispatch
 *  的产出，两端共用），本模块只做帧映射 */
export type { DriveOutcome };

/** 打开会话的返回值：sessionId + 内核当前快照 + 模型/命令目录与用量快照（ADR-0016）。
 *  快照只随 create 下发（attach 的会话已落盘，基线走 REST），目录与用量则两边都带 */
export interface OpenedSession {
  sessionId: string;
  snapshot(): SessionSnapshot;
  catalog(): SessionCatalog;
  usage(): ContextUsageInfo | undefined;
}

export interface WsGatewayDeps {
  attach(file: string, owner: OwnerToken): Promise<OpenedSession>;
  create(cwd: string, owner: OwnerToken): Promise<OpenedSession>;
  /** 已驱动会话按 sessionId 取回（同连接 attach 重放回 attached 帧，不开新宿主） */
  get(sessionId: string): OpenedSession | undefined;
  /** 按 attach 文件查 sessionId（重放幂等判定用） */
  sessionOf(file: string): string | undefined;
  /** 会话的属主连接（单表读投影，C7） */
  ownerOf(sessionId: string): OwnerToken | undefined;
  /** 该属主是否仍有存活登记（心跳判死的传感器读数） */
  isOwnerAlive(owner: OwnerToken): boolean;
  /** 心跳投喂：ping 后判活、terminate 前判死 */
  markAlive(owner: OwnerToken): void;
  markDead(owner: OwnerToken): void;
  /** 连接消亡：按属主单表释放名下全部会话，返回 sessionId（路由订阅随之撤销） */
  releaseByOwner(owner: OwnerToken): string[];
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

/** 心跳参数：interval 缺省 30s；isLive 可注入（租约僵尸让位语义单测用——
    ws 客户端自动应答 ping，真连接造不出「超期未应答」） */
export interface WsGatewayOptions {
  heartbeatMs?: number;
  isLive?(socket: WsSocket): boolean;
}

export function createWsGateway(deps: WsGatewayDeps, opts: WsGatewayOptions = {}): WsGateway {
  const wss = new WebSocketServer({ noServer: true });
  // sessionId → 订阅它的连接集合（emit 路由表；属主记账在 registry 单表，这里只有路由）
  const subscriptions = new Map<string, Set<WsSocket>>();
  // 心跳存活簿（pong 即刷新）：经代理的半开连接 close 可迟到数分钟，属主标记
  // 若只等 close 事件会一直卡住重连重放，故僵尸按心跳超期判定并接管
  const lastPong = new WeakMap<WsSocket, number>();
  const HEARTBEAT_MS = opts.heartbeatMs ?? 30_000;

  const isLive = (socket: WsSocket) =>
    opts.isLive ? opts.isLive(socket) : Date.now() - (lastPong.get(socket) ?? 0) < HEARTBEAT_MS * 2;

  function send(socket: WsSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  // 单客户端租约：server 同一时刻只服务一个控制连接，后来者直接拒绝
  let leaseHolder: WsSocket | undefined;

  /** 撤销某连接的全部属主与订阅（租约让位时用）：属主经 registry 单表释放，
   *  其 close 迟到时属主已不是它，releaseByOwner 不会重复触及 */
  function evict(socket: WsSocket): void {
    for (const sessionId of deps.releaseByOwner(socket)) unsubscribe(sessionId, socket);
    for (const sessionId of [...subscriptions.keys()]) unsubscribe(sessionId, socket);
  }

  function claim(sessionId: string, socket: WsSocket): void {
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

  /** attach / create 共用骨架：打开 → 回 attached → 登记订阅。
   *  attach 失败的 error 帧携 file 回显（Send-to-Attach 按它精确兑付，ADR-0012 补记十一）；
   *  活属主拒绝 / 僵尸接管由 registry.open 按属主单表判定（C7） */
  async function openSubscription(
    socket: WsSocket,
    open: () => Promise<OpenedSession>,
    file?: string,
  ): Promise<void> {
    try {
      const opened = await open();
      const { sessionId } = opened;
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
        // 幂等重放（同连接，use-drive 断线重连契约「attached 幂等保留已有条目」）：
        // 直接回 attached，不开新宿主。其余情形（活属主拒绝 / 僵尸接管）都交给
        // registry.attach 按属主单表判定——僵尸先在这里摘除其订阅路由
        const existing = deps.sessionOf(frame.file);
        if (existing !== undefined) {
          const owner = deps.ownerOf(existing);
          if (owner === socket) {
            const opened = deps.get(existing);
            if (opened) {
              claim(existing, socket);
              sendAttached(socket, opened, frame.file);
              return;
            }
            deps.release(existing);
          } else if (owner !== undefined && !deps.isOwnerAlive(owner)) {
            // 僵尸属主：registry 侧随 attach 释放旧宿主，路由表先摘其订阅
            // （OwnerToken 在 WS 传输里就是连接对象——deps 投影把它按不透明令牌带回）
            deps.release(existing);
            unsubscribe(existing, owner as WsSocket);
          }
        }
        return openSubscription(socket, () => deps.attach(frame.file, socket), frame.file);
      }
      case "create":
        return openSubscription(socket, () => deps.create(frame.cwd, socket));
      case "release":
        deps.release(frame.sessionId);
        owned.delete(frame.sessionId);
        unsubscribe(frame.sessionId, socket);
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
    // 已有存活持有者：拒绝后来者（不进入消息处理，不登记属主）
    if (leaseHolder && leaseHolder !== socket && isLive(leaseHolder)) {
      send(socket, { type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
      socket.close();
      return;
    }
    // 持有者已断开或心跳超期（僵尸）：先撤其属主，再让位给本连接
    if (leaseHolder && leaseHolder !== socket) evict(leaseHolder);
    leaseHolder = socket;
    // 本连接拥有的订阅（断开时逐一撤销；属主释放走属主单表）
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
      if (leaseHolder === socket) leaseHolder = undefined;
      // 连接消亡即按属主单表释放名下会话（ADR-0012：内存标记随生命周期消亡）。
      // 守卫是结构性的：新属主接管后登记的 owner 已换人，releaseByOwner 不触及；
      // close 迟到的僵尸由心跳 terminate 后走到这里兜底。
      for (const sessionId of deps.releaseByOwner(socket)) unsubscribe(sessionId, socket);
      for (const sessionId of owned) unsubscribe(sessionId, socket);
    });
  });

  // 心跳巡检：存活者继续 ping 并向属主表投喂判活，超期未应答的僵尸判死并 terminate
  // （随后 close 走 releaseByOwner 兜底清属主）
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (isLive(socket)) {
        socket.ping();
        deps.markAlive(socket);
      } else {
        deps.markDead(socket);
        socket.terminate();
      }
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

// WS 网关：驱动协议的传输实现（ADR-0012 阶段三）。
// 每条连接维护订阅表：attach / create 成功即订阅该 sessionId 的协议事件，
// release / 断开即撤订；协议层错误一律走 error 帧，连接不断。
// deps 是 registry 的窄投影（attach/create/release/drive），组装层注入。
import type { Server } from "node:http";
import { errorMessage } from "@pi-studio/shared/errors";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { ClientFrame, DriveCommand, DriveErrorCode, DriveEvent, InputDisposition, ServerFrame } from "@pi-studio/shared/protocol";
import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

/** drive 命令的处理结果（组装层产出）：ok 时 steer/followUp 携带 disposition；
 *  失败可带机器码，客户端据此走 i18n（ADR-0011） */
export type DriveOutcome =
  | { ok: true; disposition?: InputDisposition }
  | { ok: false; message: string; code?: DriveErrorCode };

/** 打开会话的返回值：sessionId + 内核当前快照（attach 回包用，create 的会话文件尚未落盘） */
export interface OpenedSession {
  sessionId: string;
  snapshot(): SessionSnapshot;
}

export interface WsGatewayDeps {
  attach(file: string): Promise<OpenedSession>;
  create(cwd: string): Promise<OpenedSession>;
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

export function createWsGateway(deps: WsGatewayDeps): WsGateway {
  const wss = new WebSocketServer({ noServer: true });
  // sessionId → 订阅它的连接集合（emit 路由表）
  const subscriptions = new Map<string, Set<WsSocket>>();

  function send(socket: WsSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  function subscribe(sessionId: string, socket: WsSocket): void {
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

  /** attach / create 共用骨架：打开 → （新建时）带基线快照回 attached → 登记订阅 */
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
      subscribe(sessionId, socket);
      // 快照只随 create 下发：attach 的会话已落盘，基线走 REST（ADR-0012：读路径不变）；
      // 且断线重连的 attach 不应全量重放（那是 Live Tail 的活儿，用字节偏移）
      const snapshot = file === undefined ? opened.snapshot() : undefined;
      send(socket, snapshot ? { type: "attached", sessionId, header: snapshot.header, entries: snapshot.entries } : { type: "attached", sessionId, file });
    } catch (err) {
      // 机器码供客户端走 i18n（ADR-0011）；服务端文案仅作调试兜底
      const code = (err as { code?: DriveErrorCode }).code;
      send(socket, { type: "error", message: errorMessage(err), ...(code ? { code } : {}) });
    }
  }

  async function handleFrame(socket: WsSocket, frame: ClientFrame, owned: Set<string>): Promise<void> {
    switch (frame?.type) {
      case "attach":
        return openSubscription(socket, owned, () => deps.attach(frame.file), frame.file);
      case "create":
        return openSubscription(socket, owned, () => deps.create(frame.cwd));
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
            send(socket, { type: "commandFailed", sessionId, message: outcome.message, ...(outcome.code ? { code: outcome.code } : {}) });
          } else if (outcome.disposition && (body.type === "steer" || body.type === "followUp")) {
            send(socket, { type: "disposition", sessionId, command: body.type, disposition: outcome.disposition });
          }
        } catch (err) {
          send(socket, { type: "commandFailed", sessionId, message: errorMessage(err) });
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
      // 否则浏览器刷新后旧连接的标记残留，同一 session 将无法重新接管
      for (const sessionId of owned) {
        deps.release(sessionId);
        unsubscribe(sessionId, socket);
      }
    });
  });

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
      for (const socket of wss.clients) socket.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

// WS 网关：驱动协议的传输实现（ADR-0012 阶段三）。
// 每条连接维护订阅表：attach / create 成功即订阅该 sessionId 的协议事件，
// release / 断开即撤订；协议层错误一律走 error 帧，连接不断。
// deps 是 registry 的窄投影（attach/create/release/drive），组装层注入。
import type { Server } from "node:http";
import type { ClientFrame, DriveCommand, DriveEvent, ServerFrame } from "@pi-studio/shared/protocol";
import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";

/** drive 命令的处理结果（组装层产出）：ok 时 steer/followUp 携带 disposition */
export type DriveOutcome = { ok: true; disposition?: "queued" | "handled" } | { ok: false; message: string };

export interface WsGatewayDeps {
  attach(file: string): Promise<{ sessionId: string }>;
  create(cwd: string): Promise<{ sessionId: string }>;
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

  wss.on("connection", (socket) => {
    // 本连接拥有的订阅（断开时逐一撤销并释放属主）
    const owned = new Set<string>();
    socket.on("message", (data) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(String(data)) as ClientFrame;
      } catch {
        send(socket, { type: "error", message: "无法解析的帧" });
        return;
      }
      void handleFrame(socket, frame, owned);
    });
    socket.on("close", () => {
      // 连接消亡即释放属主（ADR-0012：内存标记随生命周期消亡）；
      // 否则浏览器刷新后旧连接的标记残留，同一 session 将无法重新接管
      for (const sessionId of owned) deps.release(sessionId);
      for (const sessionId of owned) unsubscribe(sessionId, socket);
    });
  });

  async function handleFrame(socket: WsSocket, frame: ClientFrame, owned: Set<string>): Promise<void> {
    switch (frame?.type) {
      case "attach": {
        try {
          const { sessionId } = await deps.attach(frame.file);
          owned.add(sessionId);
          subscribe(sessionId, socket);
          send(socket, { type: "attached", sessionId, file: frame.file });
        } catch (err) {
          send(socket, { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      case "create": {
        try {
          const { sessionId } = await deps.create(frame.cwd);
          owned.add(sessionId);
          subscribe(sessionId, socket);
          send(socket, { type: "attached", sessionId });
        } catch (err) {
          send(socket, { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      case "release": {
        deps.release(frame.sessionId);
        owned.delete(frame.sessionId);
        unsubscribe(frame.sessionId, socket);
        send(socket, { type: "released", sessionId: frame.sessionId });
        return;
      }
      case "drive": {
        try {
          const outcome = await deps.drive(frame.command);
          if (!outcome.ok) {
            send(socket, {
              type: "commandFailed",
              sessionId: frame.command.sessionId,
              message: outcome.message,
            });
          } else if (outcome.disposition && (frame.command.body.type === "steer" || frame.command.body.type === "followUp")) {
            send(socket, {
              type: "disposition",
              sessionId: frame.command.sessionId,
              command: frame.command.body.type,
              disposition: outcome.disposition,
            });
          }
        } catch (err) {
          send(socket, {
            type: "commandFailed",
            sessionId: frame.command.sessionId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      default:
        send(socket, { type: "error", message: "未知帧类型" });
    }
  }

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

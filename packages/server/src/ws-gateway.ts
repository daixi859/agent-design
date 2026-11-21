// WS 网关：驱动协议的 **WS 适配器**（ADR-0019 把控制层抽出后，本模块只剩传输职责）。
// 协议语义（attach 幂等重放、单客户端租约、attached 帧组装、drive 映射、事件路由）
// 全在 ./drive-control.ts——WS 与 Electron IPC 两个适配器共用同一份语义。
// 本模块负责：`/ws` 的 upgrade 握手、JSON 帧编解码、ping/pong 心跳传感器与 terminate。
// 单客户端租约（ADR-0012 补记十六）：租约判定在控制层，本模块把 socket 包成 DriveConnection 后交它裁决。
// 属主记账在 registry 单表（C7）：owner token 就是这里的 socket 包装对象，本模块只投喂心跳存活。
import type { Server } from "node:http";
import type {
  ClientFrame,
  DriveEvent,
  DriveOutcome,
  ServerFrame,
} from "@pi-studio/shared/protocol";
import { WebSocket, WebSocketServer, type WebSocket as WsSocket } from "ws";
import { createDriveControl, type DriveConnection, type OpenedSession } from "./drive-control.ts";

// 移植期的类型再导出：组装层（main.ts）与既有测试从本模块取这些名字，形状不变
export type { DriveOutcome, OpenedSession };

/** 窄投影：与 drive-control 的 deps 同形，命名沿用 gateway 旧称（组装层零改动） */
export type WsGatewayDeps = Parameters<typeof createDriveControl>[0];

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
  // 心跳存活簿（pong 即刷新）：经代理的半开连接 close 可迟到数分钟，属主标记
  // 若只等 close 事件会一直卡住重连重放，故僵尸按心跳超期判定并接管
  const lastPong = new WeakMap<WsSocket, number>();
  const HEARTBEAT_MS = opts.heartbeatMs ?? 30_000;

  const isLive = (socket: WsSocket) =>
    opts.isLive ? opts.isLive(socket) : Date.now() - (lastPong.get(socket) ?? 0) < HEARTBEAT_MS * 2;

  // socket → 连接包装（属主令牌即该对象；同一 socket 只建一次，保证 owner 同一性）
  const connections = new WeakMap<WsSocket, DriveConnection>();
  const socketOf = new WeakMap<DriveConnection, WsSocket>();

  function send(socket: WsSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  function connectionOf(socket: WsSocket): DriveConnection {
    const existing = connections.get(socket);
    if (existing) return existing;
    const connection: DriveConnection = {
      send: (frame) => send(socket, frame),
      close: () => socket.close(),
    };
    connections.set(socket, connection);
    socketOf.set(connection, socket);
    return connection;
  }

  const control = createDriveControl(deps, {
    // 存活判定按 socket 做（心跳簿挂在 socket 上），再回到连接同一性
    isLive: (connection) => {
      const socket = socketOf.get(connection);
      return socket !== undefined && isLive(socket);
    },
  });

  wss.on("connection", (socket) => {
    const connection = connectionOf(socket);
    // 租约裁决在控制层：被拒的连接已收到 serverBusy 并被 close，不再登记任何监听
    if (!control.accept(connection)) return;

    lastPong.set(socket, Date.now());
    socket.on("pong", () => lastPong.set(socket, Date.now()));
    socket.on("message", (data) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(String(data)) as ClientFrame;
      } catch {
        control.badFrame(connection, "无法解析的帧");
        return;
      }
      control.receive(connection, frame);
    });
    socket.on("close", () => control.drop(connection));
  });

  // 心跳巡检：存活者继续 ping 并向属主表投喂判活，超期未应答的僵尸判死并 terminate
  // （随后 close 走控制层 drop 兜底清属主）
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (isLive(socket)) {
        socket.ping();
        control.markAlive(connectionOf(socket));
      } else {
        control.markDead(connectionOf(socket));
        socket.terminate();
      }
    }
  }, HEARTBEAT_MS);

  return {
    emit(event) {
      control.emit(event);
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

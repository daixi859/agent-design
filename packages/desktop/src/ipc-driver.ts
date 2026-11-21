// 桌面壳的驱动协议传输（ADR-0019）：与 ws-gateway 对称的 **IPC 适配器**。
// 协议语义全部由 drive-control 提供（租约、attach 幂等重放、attached 帧组装、drive 映射），
// 本模块只做三件传输该做的事：
//   1. 帧编解码——通道上跑的是与 WS 逐字节同形的 JSON 字符串；
//   2. 连接生命周期——渲染层的 JS 上下文消亡即连接消亡；
//   3. 不用心跳——WS 的心跳是为了判「代理后的半开连接」，IPC 同进程、消亡是可靠事件。
//
// 连接同一性：一个窗口同一时刻只应有一条协议连接（渲染层的 drive 是模块级单例）。
// 渲染进程重载会让旧的 JS 上下文凭空消失且不给告别信号，故按「同窗口后到者顶替」处理：
// 新连接到达时先把旧连接 drop（释放其名下全部会话），再让控制层裁决租约。
// 这条规则与 ADR-0012 补记十六的僵尸让位同构，把「刷新后旧属主残留」从定时器问题
// 变成了结构性保证——不需要等心跳周期。
//
// 本模块不 import electron（只 import 类型，编译后擦除）：帧语义可以用假 ipcMain /
// 假窗口直接单测，不起 Electron。
import type { ClientFrame, ServerFrame } from "@pi-studio/shared/protocol";
import {
  createDriveControl,
  type DriveConnection,
  type DriveControl,
  type DriveControlDeps,
} from "@pi-studio/server";

import { DRIVE_CHANNELS as CHANNEL } from "./channels.ts";

/** 通道名（单源在 ./channels.ts）：各键的语义注释见彼处 */
export { CHANNEL };

/** ipcMain 的最小面（注入而非直接 import：本模块要能在裸 node 下单测）。
    事件只用到 sender，故按 WindowLike 收窄——真实 ipcMain 的 IpcMainEvent.sender
    是 WebContents，结构上满足 WindowLike，可直接传入 */
export interface IpcMainLike {
  on(channel: string, listener: (event: { sender: WindowLike }, ...args: unknown[]) => void): void;
  off(channel: string, listener: (event: { sender: WindowLike }, ...args: unknown[]) => void): void;
}

/** 窗口最小面：本模块只用这两条可靠事件与 isDestroyed / send */
export interface WindowLike {
  isDestroyed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  once(event: "destroyed", listener: () => void): void;
  on(event: "render-process-gone", listener: () => void): void;
}

/** 一条 IPC 连接的记账：connId 由渲染层给（重载后必然不同），窗口消亡即整条作废 */
interface ConnectionRecord {
  id: string;
  owner: WindowLike;
  connection: DriveConnection;
  alive: boolean;
}

export interface IpcDriver {
  /** 控制层（registry 的 emit 出口接它的 emit） */
  control: DriveControl;
  /** 注册协议通道（app ready 后调用一次） */
  listen(): void;
  /** 绑定窗口：窗口消亡 / 渲染进程崩溃即释放其名下会话（IPC 没有心跳，靠可靠事件） */
  bindWindow(owner: WindowLike): void;
  /** 进程收尾：摘除通道监听 */
  dispose(): void;
}

export function createIpcDriver(deps: DriveControlDeps, ipc: IpcMainLike): IpcDriver {
  // 「后到者顶替」的判定要看窗口存活，故存活检查必须能回到记账表
  /** 已挂上生命周期监听的窗口（connect 时自动挂，避免调用方漏调 bindWindow） */
  const boundWindows = new WeakSet<WindowLike>();
  const byConnection = new Map<DriveConnection, ConnectionRecord>();
  const byId = new Map<string, ConnectionRecord>();
  const latestByWindow = new WeakMap<WindowLike, ConnectionRecord>();

  const control = createDriveControl(deps, {
    isLive: (connection) => {
      const record = byConnection.get(connection);
      return record !== undefined && record.alive && !record.owner.isDestroyed();
    },
  });

  /** 撤销一条连接：先释放属主会话（控制层 drop），再按需通知渲染层 */
  function teardown(record: ConnectionRecord, notify: boolean): void {
    if (!record.alive) return;
    record.alive = false;
    byId.delete(record.id);
    byConnection.delete(record.connection);
    if (latestByWindow.get(record.owner) === record) latestByWindow.delete(record.owner);
    control.drop(record.connection);
    if (notify && !record.owner.isDestroyed()) record.owner.send(CHANNEL.closed, record.id);
  }

  const handlers = {
    connect(event: { sender: WindowLike }, id: unknown): void {
      // connId 由渲染层生成：重载后必然是新值，同窗口后到者据此顶替旧连接
      if (typeof id !== "string" || id === "" || byId.has(id)) return;
      const owner = event.sender;
      bindLifecycle(owner);
      const previous = latestByWindow.get(owner);
      if (previous) teardown(previous, false);

      // 闭包先声明后赋值：send / close 都要回指本条记录，而记录要拿到 connection
      let record: ConnectionRecord | undefined;
      const connection: DriveConnection = {
        send: (frame: ServerFrame) => {
          // 装载前（理论上不存在）与窗口已销毁时静默丢弃：迟到的 emit 不该炸进程
          if (!record || record.owner.isDestroyed()) return;
          record.owner.send(CHANNEL.inbound, record.id, JSON.stringify(frame));
        },
        close: () => {
          if (record) teardown(record, true);
        },
      };
      record = { id, owner, alive: true, connection };
      byId.set(id, record);
      byConnection.set(connection, record);
      latestByWindow.set(owner, record);
      // 租约被拒时控制层会先发 serverBusy 帧、再调 connection.close()（→ teardown 通知）
      control.accept(connection);
    },
    frame(event: { sender: WindowLike }, id: unknown, data: unknown): void {
      if (typeof id !== "string" || typeof data !== "string") return;
      const record = byId.get(id);
      // 归属校验：别的窗口拿着别人的 connId 投帧一律忽略
      if (!record || !record.alive || record.owner !== event.sender) return;
      let frame: ClientFrame;
      try {
        frame = JSON.parse(data) as ClientFrame;
      } catch {
        control.badFrame(record.connection, "无法解析的帧");
        return;
      }
      control.receive(record.connection, frame);
    },
    disconnect(event: { sender: WindowLike }, id: unknown): void {
      if (typeof id !== "string") return;
      const record = byId.get(id);
      if (!record || record.owner !== event.sender) return;
      teardown(record, false);
    },
  };

  /** 窗口消亡 / 渲染进程崩溃即释放名下会话：IPC 没有心跳，只靠这两条可靠事件 */
  function bindLifecycle(owner: WindowLike): void {
    if (boundWindows.has(owner)) return;
    boundWindows.add(owner);
    owner.once("destroyed", () => {
      const record = latestByWindow.get(owner);
      if (record) teardown(record, false);
    });
    owner.on("render-process-gone", () => {
      const record = latestByWindow.get(owner);
      if (record) teardown(record, false);
    });
  }

  return {
    control,
    listen() {
      ipc.on(CHANNEL.connect, handlers.connect);
      ipc.on(CHANNEL.frame, handlers.frame);
      ipc.on(CHANNEL.disconnect, handlers.disconnect);
    },
    bindWindow(owner) {
      // 已由 connect 自动挂上；此处保留为显式出口（窗口尚未连协议时也可先挂）
      bindLifecycle(owner);
    },
    dispose() {
      ipc.off(CHANNEL.connect, handlers.connect);
      ipc.off(CHANNEL.frame, handlers.frame);
      ipc.off(CHANNEL.disconnect, handlers.disconnect);
    },
  };
}

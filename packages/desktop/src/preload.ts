// 桌面壳的 preload（ADR-0019 ①）：contextIsolation 开、nodeIntegration 关时的唯一传输通道。
// 经 contextBridge 注入 window.piDesktop，两面：
//   apiFetch(path)       —— 浏览路径取数，强制打到 app:// 自定义协议（不走页面源的相对路径）
//   createDriveSocket(h) —— 驱动协议桥，回调面与 app 的 DriveSocket 同形
// 构建产物是 CJS 单文件（dist/preload.cjs）：沙箱化的 preload 只能是 CJS，故这里用 ESM 语法
// 写、由 esbuild 转成 require——与 main 的模块格式解耦，类型仍是全的。
import { contextBridge, ipcRenderer } from "electron";
// 通道名单源（./channels.ts）：main 与 preload 各写一份字面量的教训见彼处
import { API_CHANNEL, DRIVE_CHANNELS as CHANNEL } from "./channels.ts";

// 注：取数不再经 app://（走 IPC，见 apiFetch）。该 scheme 仍由 main 注册并托管页面
// 与同源 /api（APP_ORIGIN 在 app-protocol.ts），preload 侧不需要知道它的值。

/** 桥的连接回调面：与 app 侧 DriveSocketHandlers 结构相同（此处是生产方，故自行声明） */
interface BridgeHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

/** 桥产出的连接：与 app 侧 DesktopDriveSocket 结构相同 */
interface BridgeSocket {
  send(data: string): void;
  postMessage(data: string): void;
  readonly ready: boolean;
  close(): void;
}

/**
 * 浏览路径取数：走 IPC（invoke），main 内调与 app:// 同一份 resolveApi。
 *
 * 为什么不做「页面在 app:// 就同源 fetch」的分支：preload 跑在 contextIsolation 的隔离世界，
 * 从那里探页面源不可靠；而 dev 形态（页面由 vite 供给）下 Chromium 本就禁止
 * 跨源 fetch 到自定义 scheme（实测报错「Cross origin requests are only supported for
 * protocol schemes: chrome, …, http, https」）。统一走 IPC 后两条形态行为逐条相同，
 * 不再有「dev 通、prod 通，但差一条路」的暗面（ADR-0019 补记一）。
 *
 * 路径必须绝对：dev 下相对路径 /api/* 会打到 vite 的 proxy，而壳里没有那个 server 进程。
 * app:// 的 /api 仍可用（生产页面同源），留作调试与直接 fetch 的兜底。
 */
async function apiFetch(path: string): Promise<unknown> {
  const target = path.startsWith("/") ? path : `/${path}`;
  const reply = (await ipcRenderer.invoke(API_CHANNEL, target)) as { status: number; body: unknown };
  if (reply.status >= 400) {
    const message = (reply.body as { error?: string } | undefined)?.error;
    throw new Error(message ?? `HTTP ${reply.status}`);
  }
  return reply.body;
}

/**
 * 驱动连接：一页一条。
 *
 * connId 由**渲染层**生成（而非 main 回传），是为了消除一个必然存在的竞态：
 * 租约被拒时 main 在 connect 处理期间就会推 serverBusy 帧，若 id 要等应答才拿到，
 * 这一帧会被丢弃（表现为「阻断页不出现、连接静默失效」）。
 */
function createDriveSocket(handlers: BridgeHandlers): BridgeSocket {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  let ready = false;
  let disposed = false;

  const onInbound = (_event: unknown, connId: unknown, json: unknown): void => {
    if (connId === id && typeof json === "string") handlers.onMessage(json);
  };
  const onClosed = (_event: unknown, connId: unknown): void => {
    if (connId !== id || disposed) return;
    ready = false;
    disposed = true;
    detach();
    handlers.onClose();
  };
  function detach(): void {
    ipcRenderer.removeListener(CHANNEL.inbound, onInbound);
    ipcRenderer.removeListener(CHANNEL.closed, onClosed);
  }

  ipcRenderer.on(CHANNEL.inbound, onInbound);
  ipcRenderer.on(CHANNEL.closed, onClosed);
  ipcRenderer.send(CHANNEL.connect, id);
  ready = true;
  // onOpen 必须**异步**上抛（与真 WebSocket 的开事件同语义）：
  // DriveClient 的 onOpen 会立即重放 attach，而那时 socketFactory 还没返回、
  // this.ws 尚未赋值——同步回调会把重放帧丢掉。微任务足矣（同 tick 的 IPC 已入队）
  queueMicrotask(() => {
    if (!disposed) handlers.onOpen();
  });

  const socket: BridgeSocket = {
    send(data: string): void {
      if (disposed) return;
      ipcRenderer.send(CHANNEL.frame, id, data);
    },
    // MessagePort 口径的别名（桥的接口形状要求，与 send 同义）
    postMessage(data: string): void {
      socket.send(data);
    },
    get ready(): boolean {
      return ready;
    },
    close(): void {
      if (disposed) return;
      disposed = true;
      ready = false;
      detach();
      ipcRenderer.send(CHANNEL.disconnect, id);
    },
  };
  return socket;
}

contextBridge.exposeInMainWorld("piDesktop", { apiFetch, createDriveSocket });

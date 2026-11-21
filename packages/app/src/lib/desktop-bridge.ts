// 桌面桥探针（ADR-0019 ①）：Electron preload 经 contextBridge 注入 window.piDesktop，
// 渲染层凭它把传输层换成「IPC 桥承载驱动协议 + 自定义协议承载浏览路径取数」。浏览器形态下
// 这个桥恒缺席——探针一律按「缺席即 web」处理，且 SSR / 无 window 环境导入本模块不得崩。
// 桥的两面各配一个落点，接进 app 侧既有缝：apiFetch → pi-client 的取数缝（②），
// createDriveSocket → DriveClient 的 socket 缝（③，即 use-drive 的 SocketFactory）。
// 本文件属 app 侧：Electron 专属的桥形状不进 shared（ADR-0019 边界）。
import type { ApiFetch } from "./pi-client";
import type { DriveSocket, DriveSocketHandlers, SocketFactory } from "../state/use-drive";

/**
 * 桥产出的驱动连接：`extends DriveSocket` —— 直接复用核心连接接口（不另造一套），
 * 故可原样交给 DriveClient（帧处理与状态归约全部照旧），回调面也用同一组
 * `DriveSocketHandlers`。IPC 的两个自然补充：postMessage 是发帧的 MessagePort 口径
 * （与 DriveSocket.send 同义，preload 侧两动词指向同一实现），close 从可选收紧为必需
 * ——桥能给可靠断连事件，configure() 换传输时据此收编旧连接。
 */
export interface DesktopDriveSocket extends DriveSocket {
  /** 发送一帧（JSON 字符串，帧形状与 WS 逐条相同；与 send 同义） */
  postMessage(data: string): void;
  /** 断开桥连接（换传输 / 窗口卸载时调用） */
  close(): void;
}

/** preload 注入的桌面桥（窗口级单例；contextIsolation 开时唯一的传输通道） */
export interface PiDesktopBridge {
  /** 自定义协议取数（替代相对路径 fetch）：成功 resolve 已解析的 JSON，失败 reject 出可读错误 */
  apiFetch(path: string): Promise<unknown>;
  /** 驱动协议桥：回调面与 WS 适配器同构（同一套帧、同一套错误码） */
  createDriveSocket(handlers: DriveSocketHandlers): DesktopDriveSocket;
}

declare global {
  interface Window {
    /** 桌面桥；浏览器形态恒为 undefined */
    piDesktop?: PiDesktopBridge;
  }
}

/** 半注入的桥（preload 与渲染层版本错配等）：形状不完整一律按缺席处理 */
function isBridge(value: unknown): value is PiDesktopBridge {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { apiFetch?: unknown; createDriveSocket?: unknown };
  return typeof candidate.apiFetch === "function" && typeof candidate.createDriveSocket === "function";
}

/** 探针：壳内（window.piDesktop 在场且形状完整）返回桥；SSR / 无 window / web 返回 undefined */
export function getDesktopBridge(): PiDesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge: unknown = window.piDesktop;
  return isBridge(bridge) ? bridge : undefined;
}

/** 是否 Desktop Shell（GLOSSARY：租约持有面 = 渲染进程存活期） */
export function isDesktopShell(): boolean {
  return getDesktopBridge() !== undefined;
}

/** 取数缝的桥适配（ADR-0019 ②）：桥以「resolve 已解析的 JSON」表达成功，故装成 200 响应，
    让 pi-client 的 HTTP 语义（ok / status / error 字段）原样沿用；失败原样冒泡（文案由桥给） */
export function bridgeFetcher(bridge: PiDesktopBridge): ApiFetch {
  return async (path) => {
    const data = await bridge.apiFetch(path);
    return new Response(JSON.stringify(data ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/** socket 缝的桥适配（ADR-0019 ③）：桥连接已结构兼容 DriveSocket（类型上 extends），
    故这里只对齐入口形态——不包适配层、不复制连接状态（ready 的 getter 原样透传）。
    包一层箭头顺带钉住 this：preload 侧的函数不保证与桥对象绑定 */
export function desktopSocketFactory(bridge: PiDesktopBridge): SocketFactory {
  return (handlers) => bridge.createDriveSocket(handlers);
}

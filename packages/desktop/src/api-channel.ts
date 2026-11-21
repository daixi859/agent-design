// 浏览路径的 IPC 取数通道（ADR-0019 补记一）：app:// 自定义协议的同源补充。
//
// 为什么需要两条通道：Chromium 只允许 fetch 到 chrome / chrome-extension / data / http / https
// 这些 scheme，跨源打到自定义 scheme 会被 CORS 直接拒绝（实测：dev 形态页面源是
// http://localhost:5173，fetch("app://pi-studio/api/sessions") 一律失败）。
// 生产形态页面本身就在 app:// 下，同源取数不受此限，故：
//   - 页面在 app://（生产）  → 走 app:// 的 /api（协议拦截，渲染层相对路径 fetch 原样可用）
//   - 页面在 http（dev）     → 走本通道（invoke），main 内调同一份端点分发（dispatchApi）
// 两条通道的分发与载荷完全一致（同一 ApiResult → 同一 JSON），差别只在传输。
import { dispatchApi, type ApiDeps, type ApiResult } from "@pi-studio/server";

/** dispatchApi 的注入面：与 server 的 dispatchApi 同签名（入参含 /api 前缀、可回 unmatched，
    由真实装配落成 404）。fakeDispatch 须自落 unmatched，才能测「未端点 → 404」这条口径 */
type Dispatch = (pathname: string, query: URLSearchParams, deps: ApiDeps) => Promise<ApiResult>;

/** 通道名（单源在 ./channels.ts） */
export { API_CHANNEL } from "./channels.ts";
import { API_CHANNEL as _API_CHANNEL } from "./channels.ts";

/** ipcMain.handle 的最小面（注入而非 import：本模块要能在裸 node 下单测） */
export interface IpcHandleLike {
  handle(channel: string, listener: (event: unknown, path: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

/** 取数应答：与 app:// 的 /api 分支同一形状（status + 可 JSON 序列化的 body） */
export interface ApiReply {
  status: number;
  body: unknown;
}

/**
 * 把一条渲染层给的路径解成应答。路径口径与预加载一致：`/api/...`（含 query）。
 * 分发装配单源在 server 的 dispatchApi（与 app:// 分支共用，404 文案随之单源）；
 * 这里只补 IPC 特有的入参守卫（invoke 的 path 不可信）。
 * dispatch 参数保留为可注入：本模块的职责恰是「路径进、应答出」的口径，
 * 测试注入假分发才能把这条口径与真实端点语义分开锁；生产传缺省（真 dispatchApi）。
 */
export async function resolveApiCall(
  deps: ApiDeps,
  path: unknown,
  dispatch: Dispatch = dispatchApi,
): Promise<ApiReply> {
  if (typeof path !== "string") return { status: 400, body: { error: "bad api path" } };
  const url = new URL(path, "app://pi-studio");
  const result = await dispatch(url.pathname, url.searchParams, deps);
  if (result.kind === "unmatched") return { status: 404, body: { error: `unknown endpoint: ${url.pathname}` } };
  return { status: result.status, body: result.body };
}

/** 挂上通道（app ready 之后调用）。dispatch 可注入以便测试锁「路径进、应答出」的口径 */
export function listenApiChannel(
  ipc: IpcHandleLike,
  deps: ApiDeps,
  dispatch: Dispatch = dispatchApi,
): void {
  ipc.handle(_API_CHANNEL, async (_event, path) => resolveApiCall(deps, path, dispatch));
}

export function closeApiChannel(ipc: IpcHandleLike): void {
  ipc.removeHandler(_API_CHANNEL);
}

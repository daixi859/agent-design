/**
 * /api 分发的**单源装配**（ADR-0019：端点语义单源在 api-routes，装配也不该两处各写一份）。
 *
 * 「剥 /api 前缀 → resolveApi → unmatched 落 404」这条流水线曾经同值出现在两处：
 * desktop 的 app:// 分支与 IPC 通道。两份字面量靠人眼同步，漂移即静默分叉——
 * 现在两个传输层都调这里，404 文案（unknown endpoint）随之单源。
 *
 * 返回形状刻意不含传输语义（不是 Response 也不是 IPC 载荷），由调用方各自装：
 * app:// 分支包成 Response，IPC 通道直接就是 ApiReply。
 */
import { resolveApi, type ApiDeps, type ApiResult } from "./api-routes.ts";

/** 分发结果：ok/error 携带状态码与载荷；unmatched 已在这里落成 404（调用方不会见到 unmatched） */
export type ApiReplyShape = Exclude<ApiResult, { kind: "unmatched" }>;

export async function dispatchApi(
  /** 完整路径（含 /api 前缀；pathname 口径，query 走第二参） */
  pathname: string,
  query: URLSearchParams,
  deps: ApiDeps,
): Promise<ApiReplyShape> {
  const result = await resolveApi(pathname.slice(4), query, deps);
  // unmatched：/api 下没有该端点。app:// 分支与 REST 的 fallthrough 到静态层不同，协议层直接 404
  if (result.kind === "unmatched") return { kind: "error", status: 404, body: { error: `unknown endpoint: ${pathname}` } };
  return result;
}

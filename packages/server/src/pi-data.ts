/**
 * 浏览数据端点的 **http 适配壳**（ADR-0019）。
 *
 * 端点语义（path + query → 数据、状态码与错误形状）全在 ./api-routes.ts 的纯函数层，
 * 本模块只做两件事：把 IncomingMessage/ServerResponse 解成参数、把结果写成 JSON 应答。
 * 桌面壳的 app:// scheme 走同一份 resolveApi，不开 http 服务（ADR-0019）。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveApi, type ApiDeps } from "./api-routes.ts";

/** JSON 响应助手：状态码 + charset 固定（REST 的全部应答都经这里出去） */
function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

/**
 * connect 风格的 /api 中间件：已剥 /api 前缀的 url → resolveApi → JSON。
 * 非 GET 与未认领的路径一律 next()（交给组装层的静态托管兜底）。
 * 注：路径口径是「已剥前缀」——剥前缀规则在 ./http-routing.ts（stripApiPrefix）。
 */
export function createPiDataApi(deps: ApiDeps) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // 浏览路径只读：非 GET 不由端点层认领，直接落到静态层（与拆分前 pi-data 的判定等价）
    if (req.method !== "GET") return next();
    const url = new URL(req.url ?? "/", "http://local");
    const result = await resolveApi(url.pathname, url.searchParams, deps);
    if (result.kind === "unmatched") return next();
    json(res, result.status, result.body);
  };
}

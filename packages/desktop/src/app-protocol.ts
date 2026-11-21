// 桌面壳的浏览路径（ADR-0019）：`app://pi-studio/**` 自定义协议在 main 进程内直答。
//   /api/*  → 复用 server 的端点纯函数层（resolveApi），与 REST 逐条同源，不开任何端口
//   其余    → 静态资源（生产）/ SPA history fallback
// 响应带 CORS 宽免：dev 形态下页面由 vite（http://localhost:5173）供给，
// 渲染层对 app:// 的取数属跨源请求，没有这行会在协议层被拦掉；本壳本机单用户无鉴权，
// 放开到 * 不新增信任边界（与 ADR-0012「与 pi CLI 同一信任边界」一致）。
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { protocol } from "electron";
import { dispatchApi, staticRelPath, type ApiDeps } from "@pi-studio/server";

/** 自定义 scheme 的 host 段：app://pi-studio/<path>（standard scheme 需要 host 才可解析相对路径） */
export const APP_SCHEME = "app";
export const APP_HOST = "pi-studio";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

/**
 * 特权注册：必须在 app ready **之前**调用。
 * `standard` 让 URL 有 origin 与相对路径语义（React Router 的 history fallback 依赖它）；
 * `supportFetchAPI` 让渲染层能用 fetch 访问；`secure` 使其按安全上下文处理（免混合内容告警）。
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** 端点层错误 → 带 CORS 的 JSON 响应（文案是调试兜底，用户可见文案在客户端 i18n） */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

/** 静态资源：先按相对路径取，取不到且无扩展名时回落 index.html（SPA 路由直达/刷新） */
async function staticResponse(pathname: string, appDist: string): Promise<Response> {
  const rel = staticRelPath(pathname);
  const target = resolve(appDist, normalize(rel).replace(/^([/\\])+/, ""));
  // 目录穿越守卫：解析后必须仍在 appDist 之内
  if (target !== appDist && !target.startsWith(appDist + sep)) {
    return new Response("forbidden", { status: 403 });
  }
  const read = async (file: string) =>
    readFile(file).then(
      (data) => ({ data }),
      () => undefined,
    );
  const direct = await read(target);
  if (direct) {
    return new Response(new Uint8Array(direct.data), {
      status: 200,
      headers: { "content-type": MIME[extname(target)] ?? "application/octet-stream" },
    });
  }
  // 带扩展名的资源真 404；无扩展名视为 SPA 路由，回落索引页
  if (extname(rel) !== "") return new Response("not found", { status: 404 });
  const index = await read(join(appDist, "index.html"));
  if (!index) return new Response("static build not found（dev 形态页面由 vite 供给）", { status: 404 });
  return new Response(new Uint8Array(index.data), {
    status: 200,
    headers: { "content-type": MIME[".html"] },
  });
}

/**
 * 挂上 app:// 的处理器（app ready 之后）。
 * `appDist` 是生产形态的渲染层构建产物目录；dev 形态页面由 vite 供给，该目录不存在时
 * 只在直接访问静态路径时 404，/api 照常工作。
 */
export function handleAppProtocol(apiDeps: ApiDeps, appDist: string): void {
  // 必须先归一：Windows 下 path.resolve 产出反斜杠，而调用方给的目录可能是正斜杠，
  // 不归一则下面的目录穿越守卫用 startsWith 比较会全部误判（实测：首页 403）。
  const distRoot = resolve(appDist);
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    // 只读浏览：非 GET 不认领（与 http 壳的判定等价）
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      // 分发装配单源在 server 的 dispatchApi（与 IPC 通道共用，404 文案随之单源）
      const result = await dispatchApi(pathname, searchParams, apiDeps);
      return jsonResponse(result.status, result.body);
    }
    return staticResponse(pathname, distRoot);
  });
}

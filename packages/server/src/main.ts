// 独立进程入口（ADR-0012 阶段三）：裸 node 直跑——
//   node packages/server/src/main.ts
// 职责：REST 只读浏览（/api，端点分布在 api-routes，http 壳在 pi-data）+ WS 驱动协议（/ws）+ 生产静态托管。
// 信任边界与 pi CLI 相同：本机单用户、无鉴权；驱动在真实 cwd 执行工具。
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionRegistry, openPiSession } from "@pi-studio/core";
import { createPiDataApi } from "./pi-data.ts";
import { browseApiDeps } from "./drive-assembly.ts";
import { staticRelPath, stripApiPrefix } from "./http-routing.ts";
import { registryDriveDeps } from "./drive-assembly.ts";
import { createWsGateway } from "./ws-gateway.ts";

// 默认 3141（π）：3001 与本机常用代理/工具端口相撞（EADDRINUSE）；
// dev 代理端 packages/app/vite.config.ts 读同一变量联动，改端口只改这一处
const PORT = Number(process.env.PI_STUDIO_PORT ?? "3141");
// 生产模式托管 app 构建产物；dev 下 dist 不存在时静态层直接 404（vite 另行供页）
const APP_DIST = fileURLToPath(new URL("../../app/dist", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

// ===== 组装：registry（core）↔ gateway（WS）双向引用以闭包延迟求值 =====
// 窄投影的逐条内容在 drive-assembly（与桌面壳的 IPC 适配器共用一份，ADR-0019）

let registry!: SessionRegistry;
const gateway = createWsGateway(registryDriveDeps(() => registry));
registry = new SessionRegistry(openPiSession, (event) => gateway.emit(event));

// ===== HTTP：/api（剥前缀转端点层）→ 静态托管 → 404 =====

// deps 组装单源在 drive-assembly（与 desktop 壳共用；driven 标记 / 全局目录的语义注释见彼处）
const piDataApi = createPiDataApi(browseApiDeps(registry));

function serveStatic(res: ServerResponse, pathname: string): void {
  const rel = staticRelPath(pathname);
  const file = join(APP_DIST, rel);
  if (!file.startsWith(APP_DIST + sep) && file !== APP_DIST) {
    res.writeHead(403).end();
    return;
  }
  readFile(file)
    .then((data) => {
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    })
    .catch(() => {
      // SPA 兜底：无扩展名的路径回落 index.html；带扩展名的资源真 404
      if (extname(rel) === "") {
        readFile(join(APP_DIST, "index.html"))
          .then((index) => {
            res.writeHead(200, { "content-type": MIME[".html"] });
            res.end(index);
          })
          .catch(() => res.writeHead(404).end("static build not found (dev 模式请走 vite)"));
      } else {
        res.writeHead(404).end();
      }
    });
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // 路由重写规则在 http-routing.ts（纯函数，有单测）：剥前缀必须保留 query
  const raw = req.url ?? "/";
  const pathname = new URL(raw, "http://localhost").pathname;
  const apiUrl = stripApiPrefix(raw);
  if (apiUrl !== undefined) {
    req.url = apiUrl;
    // 端点分发（含 /catalog）在 api-routes.ts；未认领的路径 fallthrough 到静态层，
    // 仍按原 pathname 走静态：别拿已重写的 req.url 再算一次
    void piDataApi(req, res, () => serveStatic(res, pathname));
    return;
  }
  serveStatic(res, pathname);
});
gateway.bind(server);

// ===== 生命周期 =====

server.listen(PORT, "127.0.0.1", () => {
  console.log(`pi-studio server: http://127.0.0.1:${PORT}（REST /api · WS /ws）`);
});

process.on("SIGINT", () => {
  registry.disposeAll();
  void gateway.close().then(() => server.close(() => process.exit(0)));
});

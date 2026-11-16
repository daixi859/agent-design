// 独立进程入口（ADR-0012 阶段三）：裸 node 直跑——
//   node packages/server/src/main.ts
// 职责：REST 只读浏览（/api，pi-data 原样）+ WS 驱动协议（/ws）+ 生产静态托管。
// 信任边界与 pi CLI 相同：本机单用户、无鉴权；驱动在真实 cwd 执行工具。
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionRegistry, openPiSession } from "@pi-studio/core";
import type { DriveCommand } from "@pi-studio/shared/protocol";
import { createPiDataApi } from "./pi-data.ts";
import { staticRelPath, stripApiPrefix } from "./http-routing.ts";
import { createWsGateway, type DriveOutcome } from "./ws-gateway.ts";

const PORT = Number(process.env.PI_STUDIO_PORT ?? "3001");
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

let registry!: SessionRegistry;
const gateway = createWsGateway({
  attach: (file) => registry.attach(file),
  create: (cwd) => registry.create(cwd),
  release: (sessionId) => registry.release(sessionId),
  drive: (command) => driveCommand(command),
});
registry = new SessionRegistry(openPiSession, (event) => gateway.emit(event));

/** drive 帧到 SessionHost 的分发：prompt/abort 不等运行结束（事件流负责反馈） */
async function driveCommand(command: DriveCommand): Promise<DriveOutcome> {
  const host = registry.get(command.sessionId);
  if (!host) return { ok: false, code: "sessionNotDriven", message: `session 未驱动：${command.sessionId}` };
  const body = command.body;
  switch (body.type) {
    case "prompt":
      void host.prompt(body.text);
      return { ok: true };
    case "abort":
      void host.abort();
      return { ok: true };
    case "steer": {
      const disposition = await host.steer(body.text);
      return disposition === "failed" ? { ok: false, message: "steer 被拒，详见事件流 error" } : { ok: true, disposition };
    }
    case "followUp": {
      const disposition = await host.followUp(body.text);
      return disposition === "failed" ? { ok: false, message: "followUp 被拒，详见事件流 error" } : { ok: true, disposition };
    }
  }
}
// ===== HTTP：/api（剥前缀转 pi-data）→ 静态托管 → 404 =====

const piDataApi = createPiDataApi();

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
    // pi-data 的 fallthrough 仍按原 pathname 走静态：别拿已重写的 req.url 再算一次
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

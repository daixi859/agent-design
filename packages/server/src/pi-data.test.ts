/** http 适配壳的契约（端点语义本身在 api-routes.test.ts，此处只锁“解请求 + 写应答”这层）：
    GET 命中 → JSON 状态码与 Content-Type；非 GET 与未认领路径一律 fallthrough。 */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { createPiDataApi } from "./pi-data.ts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Factory = typeof createPiDataApi;

const TS = "2026-01-01T00:00:00.000Z";
const headerLine = JSON.stringify({
  type: "session",
  version: 3,
  id: "s1",
  parentId: null,
  timestamp: TS,
  cwd: "D:/proj",
});

let root: string;
let create: Factory;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-data-shell-"));
  await mkdir(join(root, "proj"));
  await writeFile(join(root, "proj", "proj_s1.jsonl"), `${headerLine}\n`, "utf8");
  vi.stubEnv("PI_STUDIO_SESSIONS_DIR", root);
  ({ createPiDataApi: create } = await import("./pi-data.ts"));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

/** collect 型假 res：json() 只走 statusCode / setHeader / end */
function mockRes() {
  let body = "";
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    end(data?: string) {
      body = data ?? "";
    },
    body: () => body,
    headers: () => headers,
  };
  return res as unknown as ServerResponse & { body(): string; headers(): Record<string, string> };
}

/** 注入最小 deps：目录端点本文件不测，给个空投影即可 */
const deps = () => ({ catalog: async () => ({ model: { models: [] } }) });

async function call(api: ReturnType<Factory>, method: string, url: string) {
  const res = mockRes();
  let fellThrough = false;
  await api({ method, url } as IncomingMessage, res, () => {
    fellThrough = true;
  });
  return { status: res.statusCode, body: res.body(), headers: res.headers(), fellThrough };
}

describe("createPiDataApi · http 适配壳", () => {
  it("命中端点：JSON 应答带状态码与 charset", async () => {
    const res = await call(create(deps()), "GET", "/sessions");
    expect(res.fellThrough).toBe(false);
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(res.body).sessions.map((s: { id: string }) => s.id)).toEqual(["s1"]);
  });

  it("query 原样透传给端点层（Live Tail 的 ?offset=）", async () => {
    const res = await call(create(deps()), "GET", "/session/s1/tail?offset=0");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).offset).toBe(Buffer.byteLength(`${headerLine}\n`));
  });

  it("端点层报错照原状写成 JSON（404 带 error 载荷）", async () => {
    const res = await call(create(deps()), "GET", "/session/missing");
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "session not found: missing" });
  });

  it("非 GET 与未认领路径一律 fallthrough（交给静态托管）", async () => {
    for (const [method, url] of [
      ["POST", "/sessions"],
      ["GET", "/unknown"],
      ["GET", "/session"],
      ["GET", "/catalog/extra"],
    ]) {
      const res = await call(create(deps()), method, url);
      expect(res.fellThrough, `${method} ${url}`).toBe(true);
    }
  });
});

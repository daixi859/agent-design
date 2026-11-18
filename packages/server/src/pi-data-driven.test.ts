/** Send-to-Attach 的 REST 半边（ADR-0012 补记十一）：/sessions 列表按注入的属主谓词
    标 driven——他属驱动的会话客户端据此禁用输入区。SESSIONS_ROOT 在模块顶层读 env，
    须先 stub 再动态加载（type-only 导入运行时擦除，不触发加载）。 */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { createPiDataApi } from "./pi-data.ts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type PiDataApi = ReturnType<typeof createPiDataApi>;
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
let api: PiDataApi;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-data-driven-"));
  await mkdir(join(root, "proj"));
  await writeFile(join(root, "proj", "proj_s1.jsonl"), `${headerLine}\n`, "utf8");
  vi.stubEnv("PI_STUDIO_SESSIONS_DIR", root);
  ({ createPiDataApi: create } = await import("./pi-data"));
  api = create({ isFileDriven: (file) => file.endsWith("s1.jsonl") });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

/** collect 型假 res：json() 只走 statusCode / setHeader / end */
function mockRes(): ServerResponse & { body(): string } {
  let body = "";
  const res = {
    statusCode: 0,
    setHeader(_name: string, _value: string) {},
    end(data?: string) {
      body = data ?? "";
    },
    body: () => body,
  };
  return res as unknown as ServerResponse & { body(): string };
}

async function fetchSessions(target: PiDataApi) {
  const res = mockRes();
  await target({ method: "GET", url: "/sessions" } as IncomingMessage, res, () => {
    throw new Error("不应 fallthrough");
  });
  return JSON.parse(res.body()) as { sessions: Array<{ id: string; driven?: boolean }> };
}

const summaryOf = (data: { sessions: Array<{ id: string; driven?: boolean }> }) =>
  data.sessions.find((s) => s.id === "s1")!;

describe("createPiDataApi · driven 标志（Send-to-Attach）", () => {
  it("谓词命中：列表项带 driven: true", async () => {
    expect(summaryOf(await fetchSessions(api)).driven).toBe(true);
  });

  it("谓词未命中或未注入：无 driven 字段（缺省即未驱动，不占载荷）", async () => {
    expect("driven" in summaryOf(await fetchSessions(create({ isFileDriven: () => false })))).toBe(false);
    expect("driven" in summaryOf(await fetchSessions(create()))).toBe(false);
  });
});

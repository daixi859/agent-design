/**
 * 端点路由纯函数层的契约（ADR-0019）：path + query → 数据，与传输无关。
 *
 * 这些用例锁定 server 的 http 壳与桌面壳的 app:// scheme 共用的那份分发：
 * 端点清单、状态码、载荷形状、坏参数落点、未知路径的 matched: false（兜底归适配器）。
 * SESSIONS_ROOT 在模块顶层读 env（与原 pi-data 同款），故须先 stub 再动态加载。
 */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  ApiDeps,
  ApiResult,
  IsFileDriven,
  resolveApi as ResolveApi,
} from "./api-routes.ts";
import type {
  SessionDetail,
  SessionsResponse,
  TailResponse,
} from "@pi-studio/shared/pi-types";
import type { GlobalCatalog } from "@pi-studio/shared/protocol";
import type { consumeCompleteLines as ConsumeCompleteLines } from "./api-routes.ts";

const TS = "2026-01-01T00:00:00.000Z";

/** s1：正常会话（header + model_change + 一条完整 user 行 + 末尾半行） */
const s1Header = JSON.stringify({
  type: "session",
  version: 3,
  id: "s1",
  parentId: null,
  timestamp: TS,
  cwd: "D:/proj-a",
});
const s1ModelChange = JSON.stringify({
  type: "model_change",
  id: "mc1",
  parentId: "s1",
  timestamp: TS,
  provider: "anthropic",
  modelId: "claude",
});
const s1User = JSON.stringify({
  type: "message",
  id: "u1",
  parentId: "mc1",
  timestamp: TS,
  message: { role: "user", content: "你好，世界" },
});
/** 末尾半行：模拟内核正在写的当前行，tail 不应消费 */
const s1HalfLine = s1User.slice(0, 20);
const s1CompleteLines = `${s1Header}\n${s1ModelChange}\n${s1User}\n`;
const s1Text = `${s1CompleteLines}${s1HalfLine}`;

/** s2：header 缺 cwd（老版本会话），列表里应被跳过但详情可取 */
const s2Header = JSON.stringify({ type: "session", version: 1, id: "s2", parentId: null, timestamp: TS });

/** bad：文件里没有 session header（坏会话文件 → 500） */
const badLine = JSON.stringify({
  type: "message",
  id: "m1",
  parentId: null,
  timestamp: TS,
  message: { role: "assistant", content: "孤儿消息" },
});

let root: string;
let resolveApi: typeof ResolveApi;
let consumeCompleteLines: typeof ConsumeCompleteLines;

const CATALOG: GlobalCatalog = {
  model: { models: [] },
  commands: [{ name: "greet", trigger: "/greet", description: "打招呼模板", source: "prompt" }],
};

/** 组装层注入的 deps：目录给固定投影，driven 谓词按需覆盖 */
function depsOf(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return { catalog: async () => CATALOG, ...overrides };
}

/** 取 200 载荷（带上断言，避免每个用例重复判别） */
function okBody<T>(result: ApiResult): T {
  if (result.kind !== "ok") throw new Error(`应命中 200，实际：${JSON.stringify(result)}`);
  expect(result.status).toBe(200);
  return result.body as T;
}

function errorBody(result: ApiResult): string {
  if (result.kind !== "error") throw new Error(`应为错误结果，实际：${JSON.stringify(result)}`);
  return result.body.error;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "api-routes-"));
  await mkdir(join(root, "proj-a"));
  await mkdir(join(root, "proj-b"));
  await writeFile(join(root, "proj-a", "proj-a_s1.jsonl"), s1Text, "utf8");
  await writeFile(join(root, "proj-b", "proj-b_s2.jsonl"), `${s2Header}\n`, "utf8");
  await writeFile(join(root, "proj-a", "proj-a_bad.jsonl"), `${badLine}\n`, "utf8");
  // 非 .jsonl 文件不参与扫描
  await writeFile(join(root, "proj-a", "notes.txt"), "ignore me", "utf8");
  vi.stubEnv("PI_STUDIO_SESSIONS_DIR", root);
  ({ resolveApi, consumeCompleteLines } = await import("./api-routes.ts"));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("resolveApi · GET /sessions", () => {
  it("返回 rootExists 与会话列表，缺 cwd 的会话与坏文件不入选", async () => {
    const body = okBody<SessionsResponse>(await resolveApi("/sessions", "", depsOf()));
    expect(body.rootExists).toBe(true);
    expect(body.sessions.map((s) => s.id)).toEqual(["s1"]);
    const s1 = body.sessions[0];
    expect(s1).toMatchObject({
      file: join(root, "proj-a", "proj-a_s1.jsonl"),
      projectPath: "D:/proj-a",
      projectName: "proj-a",
      title: "你好，世界",
      model: "claude",
      provider: "anthropic",
      sizeBytes: Buffer.byteLength(s1Text),
    });
    expect(s1.lastActiveAt).toBe(new Date(s1.lastActiveAt).toISOString());
    // 未注入谓词：不占 driven 载荷
    expect("driven" in s1).toBe(false);
  });

  it("注入的属主谓词命中才带 driven: true（Send-to-Attach）", async () => {
    const hit = okBody<SessionsResponse>(
      await resolveApi("/sessions", "", depsOf({ isFileDriven: () => true })),
    );
    expect(hit.sessions[0].driven).toBe(true);

    const miss = okBody<SessionsResponse>(
      await resolveApi("/sessions", "", depsOf({ isFileDriven: () => false })),
    );
    expect("driven" in miss.sessions[0]).toBe(false);
  });

  it("谓词按文件路径判定（只影响命中的那些会话）", async () => {
    const isFileDriven: IsFileDriven = (file) => file.endsWith("_s2.jsonl");
    const body = okBody<SessionsResponse>(await resolveApi("/sessions", "", depsOf({ isFileDriven })));
    expect("driven" in body.sessions[0]).toBe(false);
  });
});

describe("resolveApi · GET /session/:id", () => {
  it("返回全量条目与续读偏移（未消费的末尾半行不计入）", async () => {
    const body = okBody<SessionDetail>(await resolveApi("/session/s1", "", depsOf()));
    expect(body.header.id).toBe("s1");
    expect(body.entries.map((e) => e.type)).toEqual(["session", "model_change", "message"]);
    expect(body.sizeBytes).toBe(Buffer.byteLength(s1Text));
    // 偏移只到最后一个完整行尾，末尾半行留给 tail 续读；单位是**字节**（tail 的 read position 口径）。
    // 本夹具的 user 行含中文——正是先前用字符下标时错位的场景（修前：字符下标，偏小 9 字节）
    expect(body.offset).toBe(Buffer.byteLength(s1CompleteLines));
    expect(body.offset).toBeLessThan(body.sizeBytes);
    expect(body.offset).toBeGreaterThan(s1Text.lastIndexOf("\n") + 1);
  });

  it("detail.offset 可直接喂给 tail 续读：多字节会话也不丢行（回归）", async () => {
    // 先取详情拿到续读点，再用它 tail——两处偏移单位必须同一（字节）
    const detail = okBody<SessionDetail>(await resolveApi("/session/s1", "", depsOf()));
    const tail = okBody<TailResponse>(
      await resolveApi("/session/s1/tail", `?offset=${detail.offset}`, depsOf()),
    );
    // 末尾半行尚未写完：tail 什么都不该给，更不能把半行当完整行吞掉
    expect(tail.entries).toEqual([]);
    expect(tail.offset).toBe(detail.offset);
  });

  it("坏会话文件（无 session header）落 500", async () => {
    const result = await resolveApi("/session/bad", "", depsOf());
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("应为错误结果");
    expect(result.status).toBe(500);
    expect(result.body.error).toContain("invalid session file");
  });

  it("会话不存在落 404，错误文案带 id", async () => {
    const result = await resolveApi("/session/missing", "", depsOf());
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("应为错误结果");
    expect(result.status).toBe(404);
    expect(result.body.error).toBe("session not found: missing");
  });

  it("路径参数按 URI 解码；坏转义判 400（先前落 500 并透内部文案）", async () => {
    const bad = await resolveApi("/session/%E0%A4%A", "", depsOf());
    if (bad.kind !== "error") throw new Error("应为错误结果");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("malformed session id: %E0%A4%A");
  });
});

describe("resolveApi · GET /session/:id/tail", () => {
  it("offset=0 只消费完整行，偏移推进到完整行尾", async () => {
    const body = okBody<TailResponse>(await resolveApi("/session/s1/tail", "offset=0", depsOf()));
    expect(body.entries.map((e) => e.type)).toEqual(["session", "model_change", "message"]);
    expect(body.offset).toBe(Buffer.byteLength(s1CompleteLines));
    expect(body.sizeBytes).toBe(Buffer.byteLength(s1Text));
  });

  it("缺省 offset 等价于 0（query 可传串或 URLSearchParams）", async () => {
    const fromString = okBody<TailResponse>(await resolveApi("/session/s1/tail", "", depsOf()));
    const fromParams = okBody<TailResponse>(
      await resolveApi("/session/s1/tail", new URLSearchParams("offset=0"), depsOf()),
    );
    expect(fromString.offset).toBe(fromParams.offset);
    expect(fromString.entries).toHaveLength(3);
  });

  it("已到完整行尾：再 tail 返回空条目且偏移不动", async () => {
    const atEnd = Buffer.byteLength(s1CompleteLines);
    const body = okBody<TailResponse>(
      await resolveApi("/session/s1/tail", `?offset=${atEnd}`, depsOf()),
    );
    expect(body.entries).toEqual([]);
    expect(body.offset).toBe(atEnd);
  });

  it("偏移越界夹到文件尺寸，负数夹到 0", async () => {
    const beyond = okBody<TailResponse>(
      await resolveApi("/session/s1/tail", "?offset=999999", depsOf()),
    );
    expect(beyond.offset).toBe(Buffer.byteLength(s1Text));
    expect(beyond.entries).toEqual([]);

    const negative = okBody<TailResponse>(
      await resolveApi("/session/s1/tail", "?offset=-5", depsOf()),
    );
    expect(negative.offset).toBe(Buffer.byteLength(s1CompleteLines));
    expect(negative.entries).toHaveLength(3);
  });

  it("坏 offset（非数字）判 400，文案是参数错而非 Node 内部串", async () => {
    const result = await resolveApi("/session/s1/tail", "?offset=abc", depsOf());
    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error("应为错误结果");
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid offset: abc");
  });

  it("非整数 offset（1.5 / 空串以外的怪值）判 400", async () => {
    const decimal = await resolveApi("/session/s1/tail", "?offset=1.5", depsOf());
    if (decimal.kind !== "error") throw new Error("应为错误结果");
    expect(decimal.status).toBe(400);

    // 空串按缺省 0 处理（前端有条件省略该参数，不该炸）
    const blank = await resolveApi("/session/s1/tail", "?offset=", depsOf());
    expect(blank.kind).toBe("ok");
  });

  it("会话不存在落 404", async () => {
    const result = await resolveApi("/session/missing/tail", "?offset=0", depsOf());
    if (result.kind !== "error") throw new Error("应为错误结果");
    expect(result.status).toBe(404);
    expect(errorBody(result)).toBe("session not found: missing");
  });
});

describe("resolveApi · GET /catalog", () => {
  it("目录是内核态投影，由 deps 注入（不属文件访问层）", async () => {
    const body = okBody<GlobalCatalog>(await resolveApi("/catalog", "", depsOf()));
    expect(body).toEqual(CATALOG);
  });

  it("目录装配失败落 500", async () => {
    const result = await resolveApi(
      "/catalog",
      "",
      depsOf({
        catalog: () => Promise.reject(new Error("ModelRuntime unavailable")),
      }),
    );
    if (result.kind !== "error") throw new Error("应为错误结果");
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("ModelRuntime unavailable");
  });
});

describe("resolveApi · 未认领的路径（兜底归适配器）", () => {
  it.each([
    "/",
    "/index.html",
    "/unknown",
    "/session",
    "/session/s1/",
    "/session/s1/tail/",
    "/sessions/extra",
    "/catalog/extra",
    "/api/session/s1",
  ])("%s → unmatched", async (pathname) => {
    expect(await resolveApi(pathname, "", depsOf())).toEqual({ kind: "unmatched" });
  });
});

// 以下为 Live Tail 契约的 server 半边（自 pi-data.test.ts 迁入：实现已挪到本模块）
describe("consumeCompleteLines · 完整行裁切契约", () => {
  it("只消费完整行，末尾半行留给下轮", () => {
    const consumed = consumeCompleteLines(`${s1ModelChange}\n${s1HalfLine}`);
    expect(consumed).toBeDefined();
    expect(consumed!.entries).toHaveLength(1);
    expect(consumed!.entries[0].type).toBe("model_change");
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${s1ModelChange}\n`));
    expect(consumed!.text.endsWith("\n")).toBe(true);
  });

  it("块内无换行返回 undefined（半行不产出条目）", () => {
    expect(consumeCompleteLines(s1User.slice(0, 20))).toBeUndefined();
    expect(consumeCompleteLines("")).toBeUndefined();
  });

  it("多行全消费：条目按行序、consumedBytes 覆盖全部完整行", () => {
    const consumed = consumeCompleteLines(`${s1ModelChange}\n${s1User}\n`);
    expect(consumed!.entries).toHaveLength(2);
    expect(consumed!.entries[1].type).toBe("message");
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${s1ModelChange}\n${s1User}\n`));
  });

  it("多字节 UTF-8：consumedBytes 按字节数而非字符数（偏移可续读）", () => {
    const consumed = consumeCompleteLines(`${s1User}\n`);
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${s1User}\n`));
    expect(consumed!.consumedBytes).toBeGreaterThan(`${s1User}\n`.length);
  });

  it("坏行跳过不中断（parseEntries 容错）", () => {
    const consumed = consumeCompleteLines(`not-json\n${s1ModelChange}\n`);
    expect(consumed!.entries).toHaveLength(1);
    expect(consumed!.entries[0].type).toBe("model_change");
  });
});

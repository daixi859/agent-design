/** 浏览取数 IPC 通道契约（ADR-0019 补记一）：路径解析、状态码透传、未知端点 404、坏参数原样拒绝。
 *  分发装配单源在 server 的 dispatch-api（有独立测试），这里只锁「路径怎么解、应答怎么包」。
 *  分发注入面保留（fakeDispatch）：本模块的职责恰是「路径进、应答出」的口径，注入假分发
 *  才能把这条口径与真实端点语义分开锁。 */
import { describe, expect, it } from "vitest";
import { API_CHANNEL, closeApiChannel, listenApiChannel, resolveApiCall, type IpcHandleLike } from "./api-channel.ts";
import type { ApiDeps, ApiResult } from "@pi-studio/server";

/** 假分发的调用记账：用来断言路径与 query 是怎么解出来的 */
const seen: { pathname: string; query: string }[] = [];

/** 假分发：与真实 dispatchApi 同口径（收**含 /api 前缀**的路径，自剥后记账与认领）。
    只认 /sessions 与 /catalog，其余 unmatched（由被测的 resolveApiCall 落成 404） */
const fakeDispatch = async (pathname: string, query: URLSearchParams, _deps: ApiDeps): Promise<ApiResult> => {
  const unprefixed = pathname.slice(4);
  seen.push({ pathname: unprefixed, query: query.toString() });
  if (unprefixed === "/sessions") return { kind: "ok", status: 200, body: { sessions: [], rootExists: true } };
  if (unprefixed === "/catalog") return { kind: "ok", status: 200, body: CATALOG };
  if (unprefixed === "/boom") return { kind: "error", status: 500, body: { error: "boom" } };
  return { kind: "unmatched" };
};

const CATALOG = { model: { models: [] }, commands: [] } as unknown as ApiResult extends { kind: "ok"; body: infer B } ? B : never;

const deps: ApiDeps = { catalog: async () => CATALOG as never };

describe("api-channel · 路径与应答", () => {
  it("/api 前缀被剥掉，query 一并透传", async () => {
    seen.length = 0;
    const reply = await resolveApiCall(deps, "/api/catalog?x=42", fakeDispatch);
    expect(seen).toEqual([{ pathname: "/catalog", query: "x=42" }]);
    expect(reply.status).toBe(200);
  });

  it("未知端点 → 404（与 app:// 分支同口径）", async () => {
    const reply = await resolveApiCall(deps, "/api/bogus", fakeDispatch);
    expect(reply.status).toBe(404);
    expect(reply.body).toEqual({ error: "unknown endpoint: /api/bogus" });
  });

  it("端点层的错误状态码原样透传（400 参数坏 / 500 内部）", async () => {
    expect((await resolveApiCall(deps, "/api/boom", fakeDispatch)).status).toBe(500);

    const badDispatch = async (): Promise<ApiResult> => ({ kind: "error", status: 400, body: { error: "invalid offset: abc" } });
    const reply = await resolveApiCall(deps, "/api/session/x/tail?offset=abc", badDispatch);
    expect(reply).toEqual({ status: 400, body: { error: "invalid offset: abc" } });
  });

  it("非字符串路径 → 400（桥的入参不可信）", async () => {
    expect((await resolveApiCall(deps, 42, fakeDispatch)).status).toBe(400);
    expect((await resolveApiCall(deps, undefined, fakeDispatch)).status).toBe(400);
  });

  it("相对路径也按 app://pi-studio 解析（与预加载的入参口径一致）", async () => {
    const reply = await resolveApiCall(deps, "/api/sessions", fakeDispatch);
    expect(reply.status).toBe(200);
  });
});

describe("api-channel · 通道挂载", () => {
  it("listen 后 invoke 得到应答；close 后摘除", async () => {
    const handlers = new Map<string, (event: unknown, path: unknown) => Promise<unknown>>();
    const ipc: IpcHandleLike = {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => {
        handlers.delete(channel);
      },
    };
    listenApiChannel(ipc, deps, fakeDispatch);
    expect(handlers.has(API_CHANNEL)).toBe(true);
    const reply = await handlers.get(API_CHANNEL)!({}, "/api/sessions");
    expect(reply).toEqual({ status: 200, body: { sessions: [], rootExists: true } });

    closeApiChannel(ipc);
    expect(handlers.has(API_CHANNEL)).toBe(false);
  });
});

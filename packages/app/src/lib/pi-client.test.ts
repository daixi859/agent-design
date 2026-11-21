/** 取数缝（ADR-0019 ②）：注入生效 + 缺省仍走浏览器 fetch。测试环境为 node（无 window），
    故缺省路径用 stubGlobal 手工挂一个带 fetch 的 window——顺带验证「模块顶层不取
    window.fetch」这条惰性求值约束（本文件的导入先于任何 window 的挂载）。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureFetch, fetchCatalog, fetchSession, fetchSessions, tailSession } from "./pi-client";

/** 最小响应假件：只覆盖 get() 用到的三个面 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  configureFetch(undefined); // 恢复缺省，避免用例间串味
  vi.unstubAllGlobals();
});

describe("pi-client · 取数缝", () => {
  it("缺省走 window.fetch（惰性求值：导入时无 window 也不炸）", async () => {
    const calls: string[] = [];
    vi.stubGlobal("window", {
      fetch: (path: string) => {
        calls.push(path);
        return Promise.resolve(jsonResponse({ rootExists: true, sessions: [] }));
      },
    });
    await expect(fetchSessions()).resolves.toEqual({ rootExists: true, sessions: [] });
    expect(calls).toEqual(["/api/sessions"]);
  });

  it("注入后所有取数端点都穿缝，路径保持不变", async () => {
    const calls: string[] = [];
    configureFetch((path) => {
      calls.push(path);
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    await fetchSessions();
    await fetchSession("a/b");
    await tailSession("s1", 42);
    await fetchCatalog();
    expect(calls).toEqual([
      "/api/sessions",
      "/api/session/a%2Fb",
      "/api/session/s1/tail?offset=42",
      "/api/catalog",
    ]);
  });

  it("注入失败即取数失败：非 ok 携 error 字段 → 抛该文案；无 error → 抛 HTTP 状态", async () => {
    configureFetch(() => Promise.resolve(jsonResponse({ error: "会话不存在" }, 404)));
    await expect(fetchSession("nope")).rejects.toThrow("会话不存在");
    configureFetch(() => Promise.resolve(jsonResponse({}, 500)));
    await expect(fetchSession("nope")).rejects.toThrow("HTTP 500");
  });

  it("传 undefined 恢复缺省：回到浏览器 fetch", async () => {
    configureFetch(() => Promise.reject(new Error("注入件仍在位")));
    vi.stubGlobal("window", { fetch: () => Promise.resolve(jsonResponse({ rootExists: false, sessions: [] })) });
    configureFetch(undefined);
    await expect(fetchSessions()).resolves.toEqual({ rootExists: false, sessions: [] });
  });
});

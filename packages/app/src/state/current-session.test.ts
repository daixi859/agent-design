/** currentSessionId：URL 契约的锁定测试 */
import { describe, expect, it } from "vitest";
import { currentSessionId } from "./current-session";

describe("currentSessionId · URL 契约", () => {
  it("从 /session/:id 提取 id", () => {
    expect(currentSessionId("/session/01a1e244-3e5b-704d-b07d-05d0a3ca337d")).toBe(
      "01a1e244-3e5b-704d-b07d-05d0a3ca337d",
    );
  });

  it("非 session 路由返回 undefined", () => {
    expect(currentSessionId("/")).toBeUndefined();
    expect(currentSessionId("/settings/appearance")).toBeUndefined();
    expect(currentSessionId("/settings/preview")).toBeUndefined();
  });

  it("取第一段路径段", () => {
    expect(currentSessionId("/session/abc")).toBe("abc");
    expect(currentSessionId("/session/abc/def")).toBe("abc");
  });
});

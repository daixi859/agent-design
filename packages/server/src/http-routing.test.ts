/** HTTP 路由重写的契约（这两条都曾在真实 HTTP 里静默出错，typecheck 与 handler 测试都看不见）：
    1) 剥 /api 前缀丢掉 query → Live Tail 的 ?offset= 消失，每轮从文件头全量重放
    2) 静态托管目录相对路径写错一级 → 生产模式整站 404 */
import { describe, expect, it } from "vitest";
import { staticRelPath, stripApiPrefix } from "./http-routing.ts";

describe("stripApiPrefix", () => {
  it("剥掉 /api 前缀交给 pi-data", () => {
    expect(stripApiPrefix("/api/sessions")).toBe("/sessions");
  });

  // 回归点：P0 bug 就是这里
  it("保留 query（Live Tail 的 ?offset= 靠它）", () => {
    expect(stripApiPrefix("/api/sessions/abc?offset=120&limit=5")).toBe("/sessions/abc?offset=120&limit=5");
    expect(stripApiPrefix("/api/sessions/abc?offset=0")).toContain("offset=0");
  });

  it("非 /api 路径返回 undefined（交给静态托管）", () => {
    expect(stripApiPrefix("/")).toBeUndefined();
    expect(stripApiPrefix("/index.html")).toBeUndefined();
    // 裸 /api 不算 API（下游是文件名，不是端点）
    expect(stripApiPrefix("/api")).toBeUndefined();
  });
});

describe("staticRelPath", () => {
  it("根路径映射到 index.html", () => {
    expect(staticRelPath("/")).toBe("/index.html");
  });

  it("其余路径原样（含下游 SPA 兜底的扩展名判断）", () => {
    expect(staticRelPath("/assets/app.js")).toBe("/assets/app.js");
    expect(staticRelPath("/session/abc")).toBe("/session/abc");
  });
});

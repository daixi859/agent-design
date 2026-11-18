/** 全局目录订阅壳契约（ADR-0012 补记十四）：成功 memo、失败重试、store 写穿 */
import { describe, expect, it } from "vitest";
import { globalCatalogStore } from "./global-catalog";
import { loadGlobalCatalog } from "./global-catalog";

/** 可控取数：按预排结果逐次出队 */
function scriptedFetch(results: Array<"fail" | "ok">) {
  const calls: Array<() => void> = [];
  const fetch = () =>
    new Promise<{ model: { models: never[] } }>((resolve, reject) => {
      const step = results.shift();
      calls.push(() => (step === "ok" ? resolve({ model: { models: [] } }) : reject(new Error("boom"))));
    });
  return { fetch, calls };
}

describe("loadGlobalCatalog · 取数去重", () => {
  // 顺序依赖：模块级 loaded 标记跨用例共存——先失败再成功，末尾用例依赖成功后的 memo
  it("失败不缓存：重试后成功写入 store", async () => {
    const failing = scriptedFetch(["fail"]);
    const failed = loadGlobalCatalog(failing.fetch);
    failing.calls[0]?.();
    await expect(failed).rejects.toThrow("boom");
    expect(globalCatalogStore.getState().catalog).toBeUndefined();

    const ok = scriptedFetch(["ok"]);
    const succeeded = loadGlobalCatalog(ok.fetch);
    ok.calls[0]?.();
    await succeeded;
    expect(globalCatalogStore.getState().catalog).toEqual({ model: { models: [] } });
  });

  it("成功后 memo：再调不出网", async () => {
    const noCall = scriptedFetch([]);
    await loadGlobalCatalog(noCall.fetch);
    expect(noCall.calls).toHaveLength(0);
  });
});

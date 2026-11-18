/** 浏览态目录缓存的持久化（ADR-0012 补记十二/十三）：fake Storage 即可锁定口径，
    不需要 jsdom——读写都是纯字符串映射。 */
import { describe, expect, it } from "vitest";
import { catalogKey, loadCachedCatalogs, persistCatalogs } from "./catalog-cache";

/** 最小 Storage 假件（只有缓存用到的四个面） */
function fakeStorage(seed: Record<string, string> = {}): Storage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    get data() {
      return data;
    },
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  } as Storage & { readonly data: Map<string, string> };
}

const model = { models: [], current: { provider: "p", modelId: "m" } };

describe("catalog-cache · 浏览态目录缓存的读写", () => {
  it("键前缀唯一出处：写与灌入对得上", () => {
    const storage = fakeStorage();
    persistCatalogs(storage, new Map([["s1", { model }]]), new Map());
    expect(storage.getItem(catalogKey("s1"))).toBe(JSON.stringify({ model }));
    expect(loadCachedCatalogs(storage).catalogs.get("s1")).toEqual({ model });
  });

  it("旧版本写入的完整 SessionCatalog 灌入时收窄：commands 保留（补记十五），会话级字段剥离", () => {
    const storage = fakeStorage({
      [catalogKey("s1")]: JSON.stringify({
        model,
        commands: [{ name: "x", trigger: "/x", source: "prompt" }],
        extra: "会话级杂字段",
      }),
    });
    expect(loadCachedCatalogs(storage).catalogs.get("s1")).toEqual({
      model,
      commands: [{ name: "x", trigger: "/x", source: "prompt" }],
    });
  });

  it("坏条目即弃并清键；无 model 切片的条目不入缓存", () => {
    const storage = fakeStorage({
      [catalogKey("bad")]: "{不是 JSON",
      [catalogKey("empty")]: JSON.stringify({ commands: [] }),
      [catalogKey("ok")]: JSON.stringify({ model }),
    });
    const { catalogs } = loadCachedCatalogs(storage);
    expect([...catalogs.keys()]).toEqual(["ok"]);
    expect(storage.getItem(catalogKey("bad"))).toBeNull();
  });

  it("同形内容不重写：written 记着上次写过的 JSON", () => {
    const storage = fakeStorage();
    const written = new Map<string, string>();
    persistCatalogs(storage, new Map([["s1", { model }]]), written);
    // 换一个等值对象：JSON 同形 → 不写（写穿次数靠 setItem 计数验证）
    let writes = 0;
    const counting = { ...storage, setItem: (key: string, value: string) => { writes += 1; storage.setItem(key, value); } } as Storage;
    persistCatalogs(counting, new Map([["s1", JSON.parse(JSON.stringify({ model }))]]), written);
    expect(writes).toBe(0);
  });

  it("写失败（超限 / 隐私模式）整体降级：不抛、不中断", () => {
    const failing = { ...fakeStorage(), length: 0, setItem: () => { throw new Error("QuotaExceeded"); } } as Storage;
    expect(() => persistCatalogs(failing, new Map([["s1", { model }]]), new Map())).not.toThrow();
  });
});

/** 浏览态目录缓存的持久化（ADR-0012 补记十二/十三）：localStorage 续命跨刷新。
    从组装层抽出来的理由：读写都是纯字符串映射，注入 storage 即可测；模块导入期副作用
    留在 use-drive，这里只出函数。全部守卫降级——隐私模式/超限静默，缓存 miss 只是
    菜单空，功能不阻断。 */
import { cacheableCatalog, type CachedCatalog } from "./drive-client";
import type { SessionCatalog } from "@pi-studio/shared/protocol";

const KEY_PREFIX = "pi-studio:catalog:";

/** 键前缀的唯一出处：存储侧与灌入侧共用，改名不会两边跑偏 */
export function catalogKey(sessionId: string): string {
  return KEY_PREFIX + sessionId;
}

/** 启动灌入：坏条目即弃（清键）；旧版本写入的完整 SessionCatalog（含 commands）
    也经 cacheableCatalog 收窄——命令目录不进缓存（补记十二边界）。返回值与
    「最终该写回什么」一起给：调用方据 written 做同形比较，避免无谓重写 */
export function loadCachedCatalogs(storage: Storage): {
  catalogs: Map<string, CachedCatalog>;
  written: Map<string, string>;
} {
  const catalogs = new Map<string, CachedCatalog>();
  const written = new Map<string, string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const id = key.slice(KEY_PREFIX.length);
    try {
      const json = storage.getItem(key) as string;
      const catalog = cacheableCatalog(JSON.parse(json) as SessionCatalog);
      if (!catalog) continue;
      catalogs.set(id, catalog);
      written.set(id, json);
    } catch {
      storage.removeItem(key);
    }
  }
  return { catalogs, written };
}

/** 目录切片的写穿：按 JSON 同形比较避免无谓重写；超限/写失败整体放弃（内存级降级，
    重试无意义）。written 由调用方持有，跨次调用累积「上次写了什么」 */
export function persistCatalogs(
  storage: Storage,
  catalogs: ReadonlyMap<string, CachedCatalog>,
  written: Map<string, string>,
): void {
  try {
    for (const [id, catalog] of catalogs) {
      const json = JSON.stringify(catalog);
      if (written.get(id) === json) continue;
      written.set(id, json);
      storage.setItem(catalogKey(id), json);
    }
  } catch {
    // 超限/写失败：缓存降级为内存级
  }
}

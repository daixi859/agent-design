// 全局模型目录的订阅壳（ADR-0012 补记十四）：浏览态 Model Seat 在 per-session 缓存
// 缺席时的兜底菜单源。GET /api/catalog 每页至多一次（成功即 memo 模块级）；失败不
// 缓存——下次挂载重试，目录缺席只是菜单空（与目录缓存同口径，功能不阻断）。
// 状态壳（ADR-0015）：zustand vanilla store，React 端 useStore + selector 取切片。
import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { GlobalCatalog } from "@pi-studio/shared/protocol";
import type { CachedCatalog } from "../lib/drive-client";
import { fetchCatalog } from "../lib/pi-client";

interface GlobalCatalogState {
  catalog: CachedCatalog | undefined;
}

/** 状态壳（ADR-0015）：UI 订阅端 useStore(globalCatalogStore, selector) 取切片 */
export const globalCatalogStore = createStore<GlobalCatalogState>(() => ({ catalog: undefined }));

/** 取数去重：成功后置位不再出网；失败清 in-flight，重挂载自然重试 */
let loaded = false;
let inflight: Promise<void> | undefined;

export function loadGlobalCatalog(fetch: () => Promise<GlobalCatalog> = fetchCatalog): Promise<void> {
  if (loaded) return Promise.resolve();
  if (inflight) return inflight;
  inflight = fetch()
    .then((catalog) => {
      loaded = true;
      globalCatalogStore.setState({ catalog });
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

/** 浏览态全局目录（补记十四）：挂载即确保已拉取，返回 store 切片（未到/失败为 undefined） */
export function useGlobalCatalog(): CachedCatalog | undefined {
  const catalog = useStore(globalCatalogStore, (s) => s.catalog);
  useEffect(() => {
    void loadGlobalCatalog();
  }, []);
  return catalog;
}

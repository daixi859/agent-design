// 全局目录的纯投影（ADR-0012 补记十四/十五）：REST GET /api/catalog 的数据形状在此定型。
// 不过会话——无 current/thinkingLevel（会话级，全局投影不携带），模型过滤只看「已配置
// 凭据的服务商」（会话目录另有「当前模型保留」规则，全局态无此一说）。SDK 装配
// （ModelRuntime / DefaultResourceLoader 每请求新建）在 pi-session-source（薄层不单测），
// 纯函数在此（已测）——与 catalog-cache / drive-client 的「纯逻辑已测、组装层免测」
// 分层同款。
import type { CommandCatalogItem, ModelCatalogEntry } from "@pi-studio/shared/protocol";
import {
  modelEntryOf,
  promptCommandOf,
  providerNameOf,
  skillCommandOf,
  thinkingLevelsOf,
  type CatalogProviderNames,
  type KernelModelLike,
} from "./catalog-map.ts";

/** 全局目录所需 runtime 字段子集（ModelRuntime 的窄投影，测试可注入 fake） */
export interface CatalogRuntimeLike extends CatalogProviderNames {
  getAllModels(): readonly unknown[];
  hasConfiguredAuth(provider: string): boolean;
}

/** 纯投影（已测）：全局目录的 models 列表 */
export function globalModelEntries(runtime: CatalogRuntimeLike): ModelCatalogEntry[] {
  return (runtime.getAllModels() as readonly KernelModelLike[])
    .filter((model) => runtime.hasConfiguredAuth(model.provider))
    .map((model) => modelEntryOf(model, thinkingLevelsOf(model), providerNameOf(runtime, model.provider)));
}

/** 全局命令目录所需资源字段子集（ResourceLoader 的窄投影，测试可注入 fake）：
 *  只含 prompts 与 skills——扩展命令需会话内运行器，本就不入 Trigger Menu */
export interface CatalogResourcesLike {
  getPrompts(): { prompts: ReadonlyArray<{ name: string; description?: string; argumentHint?: string }> };
  getSkills(): { skills: ReadonlyArray<{ name: string; description?: string }> };
}

/** 纯投影（已测）：全局命令目录，模板在前、skills 在后（保持源序——客户端按来源
 *  分组展示，组内序即此序） */
export function globalCommandEntries(resources: CatalogResourcesLike): CommandCatalogItem[] {
  return [
    ...resources.getPrompts().prompts.map(promptCommandOf),
    ...resources.getSkills().skills.map(skillCommandOf),
  ];
}

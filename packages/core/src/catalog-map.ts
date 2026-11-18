// 目录映射（ADR-0016）：内核形状 → 协议形状的唯一映射点。SDK 自由（纯类型 + 纯函数）——
// 会话目录（pi-session-source）与全局目录（global-catalog）共用，单测直接落在本文件
// （原在 pi-session-source 内联，为全局目录复用与可测性抽出，ADR-0012 补记十四）。
import { THINKING_LEVEL_ORDER } from "@pi-studio/shared/protocol";
import type { CommandCatalogItem, ModelCatalogEntry } from "@pi-studio/shared/protocol";

/** 目录所需的内核模型字段子集（pi-ai Model 的窄投影，结构化收窄替代 any） */
export interface KernelModelLike {
  id: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  /** 输入模态（pi-ai ModelInputModality："image" | "text"），判图片能力用 */
  input?: readonly string[];
  /** 键为 thinking 档位名（off/minimal/.../max）的映射表 */
  thinkingLevelMap?: unknown;
}

/** 目录所需 runtime 字段子集（ModelRuntime 的窄投影）：取服务商展示名 */
export interface CatalogProviderNames {
  getProvider(provider: string): { name?: string } | undefined;
}

/** 单个模型的可用档位：内核给过 thinkingLevelMap 就取键（按正典序），
 *  未给则按 reasoning 推导——setThinkingLevel 内核还会再 clamp，此处宁全勿缺 */
export function thinkingLevelsOf(model: KernelModelLike): string[] {
  const map = model.thinkingLevelMap;
  if (map && typeof map === "object") {
    const keys = Object.keys(map).filter((key) => key.length > 0);
    if (keys.length > 0) {
      // 未知档位的秩取正典长度（排最后）：indexOf 的 -1 会把未知值排到最前
      const rank = (level: string) => {
        const index = THINKING_LEVEL_ORDER.indexOf(level as (typeof THINKING_LEVEL_ORDER)[number]);
        return index === -1 ? THINKING_LEVEL_ORDER.length : index;
      };
      return keys.sort((a, b) => rank(a) - rank(b));
    }
  }
  return model.reasoning === false ? ["off"] : [...THINKING_LEVEL_ORDER];
}

/** 服务商展示名：内核给过专名（≠ provider id）才带 providerName 字段 */
export function providerNameOf(runtime: CatalogProviderNames, provider: string): string | undefined {
  const name = runtime.getProvider(provider)?.name;
  return name && name !== provider ? name : undefined;
}

/** 单条模型目录映射：thinkingLevels 由调用方给——会话态当前模型走内核权威口径
    （getAvailableThinkingLevels 已按模型 clamp），其余（含全局目录）按模型推导 */
export function modelEntryOf(
  model: KernelModelLike,
  thinkingLevels: string[],
  providerName?: string,
): ModelCatalogEntry {
  return {
    provider: model.provider,
    ...(providerName ? { providerName } : {}),
    modelId: model.id,
    ...(model.name && model.name !== model.id ? { name: model.name } : {}),
    thinkingLevels,
    ...(model.input?.includes("image") ? { supportsImages: true } : {}),
    ...(typeof model.contextWindow === "number" ? { contextWindow: model.contextWindow } : {}),
  };
}

// ===== 命令目录条目映射：prompt 模板与 skills（会话目录与全局投影共用） =====

/** 单条 prompt 模板映射：触发文本是内核 prompt() 的解释形态 */
export function promptCommandOf(template: {
  name: string;
  description?: string;
  argumentHint?: string;
}): CommandCatalogItem {
  return {
    name: template.name,
    trigger: `/${template.name}`,
    ...(template.description ? { description: template.description } : {}),
    ...(template.argumentHint ? { argumentHint: template.argumentHint } : {}),
    source: "prompt",
  };
}

/** 单条 skill 映射 */
export function skillCommandOf(skill: { name: string; description?: string }): CommandCatalogItem {
  return {
    name: skill.name,
    trigger: `/skill:${skill.name}`,
    ...(skill.description ? { description: skill.description } : {}),
    source: "skill",
  };
}

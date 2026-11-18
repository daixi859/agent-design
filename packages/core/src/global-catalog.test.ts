/** 全局目录投影契约（ADR-0012 补记十四/十五）：不过会话——模型过滤只看已配置凭据
    的服务商；命令目录只收 prompt 模板与 skills */
import { describe, expect, it } from "vitest";
import { THINKING_LEVEL_ORDER } from "@pi-studio/shared/protocol";
import {
  globalCommandEntries,
  globalModelEntries,
  type CatalogRuntimeLike,
} from "./global-catalog.ts";

/** 最小 runtime fake：getAllModels 直给，凭据表用集合表达 */
function runtime(
  models: readonly { id: string; provider: string; thinkingLevelMap?: unknown }[],
  authed: ReadonlySet<string>,
  names: ReadonlyMap<string, string> = new Map(),
): CatalogRuntimeLike {
  return {
    getAllModels: () => models,
    hasConfiguredAuth: (provider) => authed.has(provider),
    getProvider: (provider) => {
      const name = names.get(provider);
      return name ? { name } : undefined;
    },
  };
}

describe("globalModelEntries · 全局目录投影", () => {
  it("只列已配置凭据的服务商", () => {
    const entries = globalModelEntries(
      runtime(
        [
          { id: "glm-5", provider: "zhipu" },
          { id: "claude-x", provider: "anthropic" },
        ],
        new Set(["zhipu"]),
      ),
    );
    expect(entries.map((entry) => entry.modelId)).toEqual(["glm-5"]);
  });

  it("条目带推导档位与服务商展示名", () => {
    const entries = globalModelEntries(
      runtime(
        [{ id: "glm-5", provider: "zhipu", thinkingLevelMap: { high: {}, off: {} } }],
        new Set(["zhipu"]),
        new Map([["zhipu", "智谱"]]),
      ),
    );
    expect(entries).toEqual([
      { provider: "zhipu", providerName: "智谱", modelId: "glm-5", thinkingLevels: ["off", "high"] },
    ]);
  });

  it("无凭据的服务商整体缺席（models.dev 全集不入眼）", () => {
    expect(globalModelEntries(runtime([], new Set()))).toEqual([]);
  });

  it("档位缺 map 时按正典全集推导", () => {
    const entries = globalModelEntries(runtime([{ id: "glm-5", provider: "zhipu" }], new Set(["zhipu"])));
    expect(entries[0]?.thinkingLevels).toEqual([...THINKING_LEVEL_ORDER]);
  });
});

describe("globalCommandEntries · 全局命令投影", () => {
  it("模板在前、skills 在后，保持源序；触发文本走内核解释形态", () => {
    const entries = globalCommandEntries({
      getPrompts: () => ({ prompts: [{ name: "review", description: "评审", argumentHint: "[范围]" }] }),
      getSkills: () => ({ skills: [{ name: "tdd" }, { name: "retro", description: "复盘" }] }),
    });
    expect(entries).toEqual([
      { name: "review", trigger: "/review", description: "评审", argumentHint: "[范围]", source: "prompt" },
      { name: "tdd", trigger: "/skill:tdd", source: "skill" },
      { name: "retro", trigger: "/skill:retro", description: "复盘", source: "skill" },
    ]);
  });

  it("空资源返回空目录", () => {
    expect(globalCommandEntries({ getPrompts: () => ({ prompts: [] }), getSkills: () => ({ skills: [] }) })).toEqual(
      [],
    );
  });
});

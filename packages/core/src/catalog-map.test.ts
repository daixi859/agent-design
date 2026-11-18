/** 目录映射契约（ADR-0016 / 补记十四）：条目级映射纯函数，会话目录与全局目录共用 */
import { describe, expect, it } from "vitest";
import { THINKING_LEVEL_ORDER } from "@pi-studio/shared/protocol";
import {
  modelEntryOf,
  promptCommandOf,
  providerNameOf,
  skillCommandOf,
  thinkingLevelsOf,
  type KernelModelLike,
} from "./catalog-map.ts";

/** 最小内核模型夹具：只填映射关心的字段 */
function model(overrides: Partial<KernelModelLike> = {}): KernelModelLike {
  return { id: "glm-5", provider: "zhipu", ...overrides };
}

describe("thinkingLevelsOf · 档位推导", () => {
  it("有 thinkingLevelMap 取键并按正典序排", () => {
    const levels = thinkingLevelsOf(model({ thinkingLevelMap: { high: {}, off: {}, low: {} } }));
    expect(levels).toEqual(["off", "low", "high"]);
  });

  it("档位不在正典序的排最后（未知值兜底）", () => {
    const levels = thinkingLevelsOf(model({ thinkingLevelMap: { custom: {}, off: {} } }));
    expect(levels[0]).toBe("off");
    expect(levels.at(-1)).toBe("custom");
  });

  it("无 map 且 reasoning=false 只剩 off", () => {
    expect(thinkingLevelsOf(model({ reasoning: false }))).toEqual(["off"]);
  });

  it("无 map 且非 reasoning=false 退正典全集", () => {
    expect(thinkingLevelsOf(model({}))).toEqual([...THINKING_LEVEL_ORDER]);
  });
});

describe("providerNameOf · 服务商展示名", () => {
  it("专名与 id 不同才带 providerName", () => {
    expect(providerNameOf({ getProvider: () => ({ name: "智谱" }) }, "zhipu")).toBe("智谱");
  });

  it("专名等于 id 时省略（避免冗余展示）", () => {
    expect(providerNameOf({ getProvider: () => ({ name: "zhipu" }) }, "zhipu")).toBeUndefined();
  });

  it("provider 缺席省略", () => {
    expect(providerNameOf({ getProvider: () => undefined }, "zhipu")).toBeUndefined();
  });
});

describe("modelEntryOf · 单条目录映射", () => {
  it("全字段投影", () => {
    expect(
      modelEntryOf(
        model({ name: "GLM-5", contextWindow: 200000, input: ["image", "text"] }),
        ["off", "high"],
        "智谱",
      ),
    ).toEqual({
      provider: "zhipu",
      providerName: "智谱",
      modelId: "glm-5",
      name: "GLM-5",
      thinkingLevels: ["off", "high"],
      supportsImages: true,
      contextWindow: 200000,
    });
  });

  it("可选字段缺席时字段整体不出现", () => {
    expect(modelEntryOf(model({ name: "glm-5" }), ["off"])).toEqual({
      provider: "zhipu",
      modelId: "glm-5",
      thinkingLevels: ["off"],
    });
  });
});

describe("promptCommandOf / skillCommandOf · 命令条目映射", () => {
  it("prompt 模板：trigger 直用名，描述与参数提示可选携带", () => {
    expect(promptCommandOf({ name: "review", description: "代码评审", argumentHint: "[范围]" })).toEqual({
      name: "review",
      trigger: "/review",
      description: "代码评审",
      argumentHint: "[范围]",
      source: "prompt",
    });
    expect(promptCommandOf({ name: "review" })).toEqual({
      name: "review",
      trigger: "/review",
      source: "prompt",
    });
  });

  it("skill：trigger 走 /skill: 前缀", () => {
    expect(skillCommandOf({ name: "tdd", description: "测试先行" })).toEqual({
      name: "tdd",
      trigger: "/skill:tdd",
      description: "测试先行",
      source: "skill",
    });
    expect(skillCommandOf({ name: "tdd" })).toEqual({ name: "tdd", trigger: "/skill:tdd", source: "skill" });
  });
});

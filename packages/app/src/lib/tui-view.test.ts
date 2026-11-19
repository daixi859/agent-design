/** tui-view 契约：ADR-0014 运行态派生的家——判定可测、组件只读结果（C4 收编） */
import { describe, expect, it } from "vitest";
import {
  activeThinkingIdOf,
  compactItemOf,
  groupElapsedOf,
  slotElapsedOf,
  thinkingElapsedOf,
  tuiDetachOf,
} from "./tui-view";
import type { GroupItem, Turn } from "./transcript-model";

const thinking = (id: string, opts: { complete?: boolean } = {}): GroupItem => ({
  kind: "thinking",
  id,
  thinking: "想",
  ...(opts.complete ? { thinkingComplete: true } : {}),
});

const tool = (id: string, state: "running" | "ok" | "error" | "stopped"): GroupItem => ({
  kind: "toolCall",
  id,
  name: "bash",
  state,
});

const turn = (over: Partial<Turn>): Turn => ({
  id: "t1",
  items: [],
  ...over,
});

describe("activeThinkingIdOf", () => {
  it("liveHeader + turn 尾部 + 末条是思考且未定稿 → 活跃", () => {
    const group = [tool("a", "ok"), thinking("b")];
    expect(activeThinkingIdOf(group, true, true)).toBe("b");
  });

  it("思考已定稿（thinking_end）→ 不活跃", () => {
    const group = [thinking("b", { complete: true })];
    expect(activeThinkingIdOf(group, true, true)).toBeUndefined();
  });

  it("组不是 turn 尾部 → 组内思考即便排末位也已完成（正文 flush 终结组）", () => {
    const group = [thinking("b")];
    expect(activeThinkingIdOf(group, true, false)).toBeUndefined();
  });

  it("非 liveHeader（结算头部）→ 无活跃思考", () => {
    const group = [thinking("b")];
    expect(activeThinkingIdOf(group, false, true)).toBeUndefined();
  });

  it("末条是工具而非思考 → 无活跃思考", () => {
    const group = [thinking("a"), tool("b", "running")];
    expect(activeThinkingIdOf(group, true, true)).toBeUndefined();
  });
});

describe("compactItemOf", () => {
  it("倒序找 running 工具优先", () => {
    const group = [tool("a", "running"), thinking("b"), tool("c", "running"), tool("d", "ok")];
    expect(compactItemOf(group, undefined)?.id).toBe("c");
  });

  it("无 running 工具时活跃思考次之", () => {
    const group = [tool("a", "ok"), thinking("b")];
    expect(compactItemOf(group, "b")?.id).toBe("b");
  });

  it("全静止兜底末条（并行乱序完成时不亮已结算项）", () => {
    const group = [tool("a", "ok"), tool("b", "error")];
    expect(compactItemOf(group, undefined)?.id).toBe("b");
  });

  it("空组回 undefined（空窗锚组）", () => {
    expect(compactItemOf([], undefined)).toBeUndefined();
  });
});

describe("slotElapsedOf", () => {
  const NOW = 100_000;

  it("运行中 = 挂钟 − 条目时间戳锚", () => {
    expect(slotElapsedOf({ state: "running", startedAt: NOW - 12_500 }, NOW, "en")).toBe("12.5s");
  });

  it("运行中缺锚不报（不发明 0s）", () => {
    expect(slotElapsedOf({ state: "running" }, NOW, "en")).toBeUndefined();
    expect(slotElapsedOf({ state: "running", startedAt: NOW - 5_000 }, undefined, "en")).toBeUndefined();
  });

  it("结算 = 内核 durationMs", () => {
    expect(slotElapsedOf({ state: "ok", durationMs: 3_200 }, NOW, "en")).toBe("3.2s");
  });

  it("都没值就不报", () => {
    expect(slotElapsedOf({ state: "ok" }, NOW, "en")).toBeUndefined();
  });
});

describe("thinkingElapsedOf / groupElapsedOf", () => {
  const NOW = 100_000;

  it("活动思考行：挂钟 − startedAt 锚，无锚不报", () => {
    expect(thinkingElapsedOf(NOW - 4_000, NOW, "en")).toBe("4.0s");
    expect(thinkingElapsedOf(undefined, NOW, "en")).toBeUndefined();
  });

  it("组头秒数：仅 liveHeader 且有锚时挂钟求值", () => {
    expect(groupElapsedOf(NOW - 2_000, true, NOW, "en")).toBe("2.0s");
    expect(groupElapsedOf(NOW - 2_000, false, NOW, "en")).toBeUndefined();
    expect(groupElapsedOf(undefined, true, NOW, "en")).toBeUndefined();
  });
});

describe("tuiDetachOf", () => {
  it("非 TUI 模式不抽取", () => {
    expect(tuiDetachOf(turn({ tailGroupId: "g2" }), true, false)).toEqual({});
  });

  it("末轮且 live → 抽尾组", () => {
    expect(tuiDetachOf(turn({ tailGroupId: "g2", userAt: 1 }), true, true)).toEqual({ groupId: "g2" });
  });

  it("末轮草稿（Draft）即使未 live 也抽", () => {
    expect(tuiDetachOf(turn({ tailGroupId: "g2", draft: true }), false, true)).toEqual({ groupId: "g2" });
  });

  it("历史轮（非 live 无 draft）不抽——历史残留 running 组不动", () => {
    expect(tuiDetachOf(turn({ tailGroupId: "g2" }), false, true)).toEqual({});
  });

  it("空窗（turn 无组）→ 锚在 user 条目时刻", () => {
    expect(tuiDetachOf(turn({ userAt: 42 }), true, true)).toEqual({ pendingAnchorAt: 42 });
  });

  it("空窗且无 userAt → 空", () => {
    expect(tuiDetachOf(turn({}), true, true)).toEqual({});
  });

  it("无末轮 → 空", () => {
    expect(tuiDetachOf(undefined, true, true)).toEqual({});
  });
});

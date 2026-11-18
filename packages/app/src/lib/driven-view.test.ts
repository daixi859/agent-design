/** resolveDrivenView 契约：基线 × 驱动条目的合成必须随**两者**变化而重算。
    这组用例是 ADR-0012 补记第 3 条的机器判据——
    上一次回归正是「基线在 ref 里不可响应，attached 先到、REST 404 后到，视图永久 undefined」。
    fixture 一律真实父子链：全部 parentId null 时叶子扫描只会选中末条，
    断言会空转（回归点见「流式草稿挂在活动分支尾」用例）。 */
import { describe, expect, it } from "vitest";
import type { SessionEntry, SessionSnapshot } from "@pi-studio/shared/pi-types";
import { PENDING_PROMPT_ENTRY_ID } from "./drive-client";
import type { DriveSession } from "./drive-client";
import { resolveDrivenView } from "./driven-view";

const user = (id: string, text: string, parentId: string | null = null): SessionEntry => ({
  type: "message",
  id,
  parentId,
  timestamp: "T0",
  message: { role: "user", content: text },
});

const assistant = (id: string, parentId: string | null, text: string): SessionEntry => ({
  type: "message",
  id,
  parentId,
  timestamp: "T0",
  message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop" },
});

const snap = (entries: SessionEntry[], cwd = "/p"): SessionSnapshot => ({
  header: { type: "session", version: 3, id: "s1", parentId: null, timestamp: "T0", cwd },
  entries,
});

const driven = (entries: SessionEntry[]): DriveSession => ({ sessionId: "s1", status: "idle", entries });

describe("resolveDrivenView", () => {
  it("无驱动会话或无基线时都不产出（调用方回落 REST/Live Tail 视图）", () => {
    expect(resolveDrivenView(undefined, snap([]))).toBeUndefined();
    expect(resolveDrivenView(driven([]), null)).toBeUndefined();
  });

  it("两边都就绪时合成出视图", () => {
    const view = resolveDrivenView(driven([]), snap([user("m1", "你好")]));
    expect(view).toBeDefined();
    expect(view!.turns).toHaveLength(1);
  });

  // 回归点：基线后到（create 会话先拿到 attached 快照、REST 稍后才失败/成功）
  it("基线后到必须重新产出视图（否则被缓存为 undefined，Composer 永久禁用）", () => {
    const session = driven([user("m1", "你好")]);
    expect(resolveDrivenView(session, null)).toBeUndefined();

    // 同一 driveSession 引用、新基线 → 必须产出
    const late = resolveDrivenView(session, snap([user("m1", "你好")]));
    expect(late).toBeDefined();
    expect(late!.turns).toHaveLength(1);
  });

  it("双源按 id 幂等归并：重叠条目只算一次", () => {
    const view = resolveDrivenView(driven([user("m1", "你好")]), snap([user("m1", "你好")]));
    expect(view!.turns).toHaveLength(1);
    expect(view!.abandonedCount).toBe(0);
  });

  // 红证据（实测）：回车后 4 秒内 44 个 delta 帧到达，DOM 文本长度一动不动。
  it("权威条目到达前，流式增量已进入视图（不再白屏等整轮结束）", () => {
    const session: DriveSession = { ...driven([]), status: "running", streaming: { text: "正在生成" } };
    const view = resolveDrivenView(session, snap([user("m1", "问：")]));
    expect(view).toBeDefined();
    expect(JSON.stringify(view)).toContain("正在生成");
  });

  // 回归点（ADR-0012 补记七）：草稿 parentId 曾为 null——叶子扫描把它当成新根，
  // 流式期间整条真实分支被误判为「被弃」，transcript 塌缩成只剩草稿一条。
  it("流式草稿挂在活动分支尾：历史与用户气泡不再塌缩", () => {
    const session: DriveSession = {
      ...driven([assistant("m2", "m1", "第一段")]),
      status: "running",
      streaming: { text: "正在生成", thinking: "思考中" },
    };
    const view = resolveDrivenView(session, snap([user("m1", "问：")]));
    expect(view!.turns).toHaveLength(1);
    expect(view!.abandonedCount).toBe(0);
    expect(view!.turns[0].id).toBe("m1");
    const text = JSON.stringify(view);
    // 流序：思考（group）在生成中的正文之前
    expect(text.indexOf("思考中")).toBeLessThan(text.indexOf("正在生成"));
  });

  // 验收反馈：运行中发起工具调用时，内容区里要有「调用中」行（此前只有 Composer 徽标）
  it("调用中指示进入视图：合成 running 工具行挂分支尾", () => {
    const session: DriveSession = {
      ...driven([]),
      status: "running",
      streamingToolCalls: [{ id: "tc1", name: "bash" }],
    };
    const view = resolveDrivenView(session, snap([user("m1", "问：")]));
    expect(view!.abandonedCount).toBe(0);
    const groups = view!.turns[0].items.filter((item) => item.kind === "group");
    const tool = groups.at(-1)?.group.find((item) => item.kind === "toolCall");
    expect(tool).toMatchObject({ name: "bash", state: "running" });
  });

  it("权威条目到达后瞬态叠加消失：同一句只出现一次（不重复渲染）", () => {
    const partial: DriveSession = { ...driven([]), status: "running", streaming: { text: "回答" } };
    const before = JSON.stringify(resolveDrivenView(partial, snap([user("m1", "问：")])));
    expect(before.split("回答")).toHaveLength(2); // 仅瞬态叠加一份

    // 条目落盘、streaming 已清 → 只剩权威条目那份
    const after = JSON.stringify(
      resolveDrivenView(driven([]), snap([user("m1", "问："), assistant("m2", "m1", "回答")])),
    );
    expect(after.split("回答")).toHaveLength(2);
  });

  // 待回显（GLOSSARY「Pending Echo」）：回车后、首 token 前内容区不能空白
  it("待回显：已发出的 prompt 在权威条目回传前先成为一轮", () => {
    const session: DriveSession = { ...driven([]), status: "idle", pendingPrompt: "你好" };
    const view = resolveDrivenView(session, snap([]));
    expect(view!.turns).toHaveLength(1);
    expect(view!.turns[0].id).toBe(PENDING_PROMPT_ENTRY_ID);
    expect(view!.abandonedCount).toBe(0);
  });

  it("待回显 → 流式草稿：两者同处一轮（草稿接在待回显之后，而非另起分支）", () => {
    const session: DriveSession = {
      ...driven([]),
      status: "running",
      pendingPrompt: "你好",
      streaming: { text: "正在生成" },
    };
    const view = resolveDrivenView(session, snap([]));
    expect(view!.turns).toHaveLength(1);
    expect(view!.turns[0].id).toBe(PENDING_PROMPT_ENTRY_ID);
    expect(JSON.stringify(view)).toContain("正在生成");
    expect(view!.abandonedCount).toBe(0);
  });

  it("驱动增量追加在基线之后（先见顺序）", () => {
    const view = resolveDrivenView(driven([assistant("m2", "m1", "第二句")]), snap([user("m1", "第一句")]));
    expect(view!.turns).toHaveLength(1);
    const text = JSON.stringify(view);
    expect(text.indexOf("第一句")).toBeGreaterThan(-1);
    expect(text.indexOf("第二句")).toBeGreaterThan(text.indexOf("第一句"));
  });
});

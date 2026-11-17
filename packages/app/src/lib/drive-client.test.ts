/** drive-client 纯逻辑契约：ServerFrame 入 → 客户端状态出；
    条目幂等合并（REST 全量 × WS 事件流归并的数据基础，ADR-0012 断线恢复） */
import { describe, expect, it } from "vitest";
import type { AssistantMessage, MessageEntry, SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type { DriveEvent, ServerFrame } from "@pi-studio/shared/protocol";
import {
  PENDING_PROMPT_ENTRY_ID,
  applyServerFrame,
  mergeEntries,
  pendingPromptEntries,
  streamingEntries,
  type DriveSession,
} from "./drive-client";

const entry = (id: string): SessionEntry => ({
  type: "message",
  id,
  parentId: null,
  timestamp: "T0",
  message: { role: "user", content: `内容 ${id}` },
});

const event = (body: DriveEvent["body"]): ServerFrame => ({ type: "event", event: { sessionId: "s1", body } });

const header: SessionHeaderEntry = { type: "session", version: 3, id: "s1", parentId: null, timestamp: "T0", cwd: "/p" };
const attached: ServerFrame = { type: "attached", sessionId: "s1", file: "f1.jsonl", header, entries: [] };
// attach 路径不带快照（快照只随 create 下发，ADR-0012 补记二）
const attachedBare: ServerFrame = { type: "attached", sessionId: "s1", file: "f1.jsonl" };

describe("mergeEntries · 双源幂等归并", () => {
  it("按 id 去重、先见顺序保留（REST 全量在前，驱动增量在后）", () => {
    const rest = [entry("e1"), entry("e2")];
    const live = [entry("e2"), entry("e3")];
    expect(mergeEntries(rest, live)).toEqual([entry("e1"), entry("e2"), entry("e3")]);
  });

  it("任一源为空时返回另一源", () => {
    expect(mergeEntries([], [entry("e1")])).toEqual([entry("e1")]);
    expect(mergeEntries([entry("e1")], [])).toEqual([entry("e1")]);
  });
});

describe("applyServerFrame · 帧到客户端状态", () => {
  // 回归点：attach 路径不带快照时，首个 attached 帧仍必须登记 session——
  // 否则驱动表里没有它，Composer 永远禁用（attach 已有会话的默认路径）
  it("无快照的 attached 也登记 session（attach 路径，非 create）", () => {
    const state = applyServerFrame(undefined, attachedBare);
    expect(state).toBeDefined();
    expect(state!.status).toBe("idle");
    expect(state!.entries).toEqual([]);
    expect(state!.header).toBeUndefined();
  });

  it("无快照的 attached 重放仍幂等（不新建对象）", () => {
    const first = applyServerFrame(undefined, attachedBare);
    expect(applyServerFrame(first, attachedBare)).toBe(first);
  });

  it("attached → 建 idle 空态；重复 attached 幂等保留已有条目", () => {
    const created = applyServerFrame(undefined, attached);
    expect(created).toEqual({ sessionId: "s1", status: "idle", entries: [], header });

    const withEntry = applyServerFrame(created, event({ type: "entry", entry: entry("e1") }));
    expect(applyServerFrame(withEntry, attached)).toBe(withEntry);
  });

  it("entry 事件：追加新条目；重复 id 幂等跳过", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e1") }));
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e2") }));
    expect(state?.entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    const before = state;
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e2") }));
    expect(state).toBe(before);
  });

  it("status 事件：更新运行状态", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "status", status: "running" }));
    expect(state?.status).toBe("running");
    state = applyServerFrame(state, event({ type: "status", status: "idle", aborted: true }));
    expect(state?.status).toBe("idle");
  });

  it("error 事件与 commandFailed：lastError 更新", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "error", message: "模型失败" }));
    expect(state?.lastError).toBe("模型失败");
    state = applyServerFrame(state, { type: "commandFailed", sessionId: "s1", message: "steer 被拒" });
    expect(state?.lastError).toBe("steer 被拒");
  });

  it("disposition：瞬态信息不入状态（引用不变）", () => {
    let state: DriveSession | undefined = applyServerFrame(undefined, attached);
    const before = state;
    state = applyServerFrame(state, {
      type: "disposition",
      sessionId: "s1",
      command: "steer",
      disposition: "queued",
    });
    expect(state).toBe(before);
  });

  // 红证据（实测）：一轮 152 个 delta 帧搬运了 376 字的正文，而 transcript 文本长度全程不变，
  // 全部内容在 turn_end 边界一次性爆出 → 用户看到「回车后白屏，然后一起展示」。
  it("delta 事件：正文增量累积为瞬态叠加（此前整条丢弃 → 整轮白屏）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "status", status: "running" }));
    state = applyServerFrame(state, event({ type: "delta", field: "text", delta: "春" }));
    state = applyServerFrame(state, event({ type: "delta", field: "text", delta: "天" }));
    expect(state?.streaming?.text).toBe("春天");
  });

  it("delta 的 text 与 thinking 分量各走各的，互不覆盖", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "想" }));
    state = applyServerFrame(state, event({ type: "delta", field: "text", delta: "答" }));
    // 正文开流即思考定稿（ADR-0012 补记九）：thinkingComplete 是粘滞的完成标志；
    // 计时锚随首个 delta 起表（ADR-0014）
    expect(state?.streaming).toEqual({
      thinking: "想",
      text: "答",
      thinkingComplete: true,
      anchorAt: expect.any(String),
    });
  });

  it("thinkingEnd 帧：思考定稿置粘滞标志（redacted thinking 无增量也能命中）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "想" }));
    state = applyServerFrame(state, event({ type: "thinkingEnd" }));
    expect(state?.streaming).toEqual({
      thinking: "想",
      thinkingComplete: true,
      anchorAt: expect.any(String),
    });
  });

  it("thinkingEnd 帧：streaming 未建（redacted 无增量直达）也容下标志（补记九的容忍）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "thinkingEnd" }));
    expect(state?.streaming).toEqual({ thinkingComplete: true });
    // 标志先落：此后首个 delta 在真草稿上沿用，不因迟到而丢失
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "想" }));
    expect(state?.streaming?.thinkingComplete).toBe(true);
    expect(state?.streaming?.thinking).toBe("想");
  });

  it("计时锚随草稿生灭：首个 delta 起表沿用，落盘后下轮重新起表（不串轮、不串会话）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "想" }));
    const anchor = state?.streaming?.anchorAt;
    expect(anchor).toBeTruthy();
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "再" }));
    expect(state?.streaming?.anchorAt).toBe(anchor);
    // 权威条目落盘 = 草稿让位 = 锚随之消失；下一轮 delta 重新起表
    // （同毫秒内两次起表取值相同，不比 not.toBe，新锚存在即语义成立）
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e1") }));
    expect(state?.streaming).toBeUndefined();
    state = applyServerFrame(state, event({ type: "delta", field: "thinking", delta: "新" }));
    expect(state?.streaming?.anchorAt).toBeTruthy();
  });

  it("权威条目到达：瞬态叠加整体让位（entry 是权威，ADR-0012）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "delta", field: "text", delta: "春" }));
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e1") }));
    expect(state?.streaming).toBeUndefined();
  });

  // 待回显（GLOSSARY「Pending Echo」）：权威 user 条目就是 prompt 的回显，本地气泡随之让位。
  // 内核要等 assistant 的 message_start 才回传（ADR-0012 补记四），期间气泡不能被无关条目顶掉。
  it("待回显：新到权威 user 条目让位；非 user 条目保留", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "entry", entry: entry("old") }));
    const pending: DriveSession = { ...state!, pendingPrompt: "问" };
    // assistant / toolResult 等无关条目先到（不应顶掉气泡）
    const assistantEntry: SessionEntry = {
      type: "message",
      id: "a1",
      parentId: null,
      timestamp: "T1",
      message: { role: "assistant", content: [], stopReason: "pending" },
    };
    const afterAssistant = applyServerFrame(pending, event({ type: "entry", entry: assistantEntry }));
    expect(afterAssistant?.pendingPrompt).toBe("问");
    // 权威 user 条目到达：让位
    const afterUser = applyServerFrame(afterAssistant!, event({ type: "entry", entry: entry("echo") }));
    expect(afterUser?.pendingPrompt).toBeUndefined();
    // 重复 user 条目（重放）：幂等命中，引用不变
    expect(applyServerFrame(afterUser, event({ type: "entry", entry: entry("echo") }))).toBe(afterUser);
  });

  it("待回显：error 与 commandFailed 即让位（prompt 不会再有回显）", () => {
    let state = applyServerFrame(undefined, attached);
    let pending: DriveSession = { ...state!, pendingPrompt: "问" };
    pending = applyServerFrame(pending, event({ type: "error", message: "模型失败" }))!;
    expect(pending.pendingPrompt).toBeUndefined();
    pending = { ...pending, pendingPrompt: "问" };
    pending = applyServerFrame(pending, { type: "commandFailed", sessionId: "s1", message: "被拒" })!;
    expect(pending.pendingPrompt).toBeUndefined();
  });

  it("toolCall 帧：start 亮起调用指示，end 按 id 匹配熄灭", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash" }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc1", name: "bash" }]);
    // 迟到的 end（id 不匹配）不得灭掉后来的 start
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc2", name: "edit" }));
    state = applyServerFrame(state, event({ type: "toolCall", phase: "end", id: "tc1", name: "bash" }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc2", name: "edit" }]);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "end", id: "tc2", name: "edit" }));
    expect(state?.streamingToolCalls).toBeUndefined();
  });

  it("toolCall 帧：start 带 args，同 id 双发后到者覆盖（流式声明 → 执行开始，ADR-0012 补记八）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "pnpm bu" } }));
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "pnpm build" } }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc1", name: "bash", args: { command: "pnpm build" } }]);
  });

  it("toolCall 帧：start 同 id 原位覆盖保源序（多帧连发不抖动，ADR-0012 补记十）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash" }));
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc2", name: "edit" }));
    // tc1 的参数流帧到达：原位更新，不挪到队尾
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "ls" } }));
    expect(state?.streamingToolCalls).toEqual([
      { id: "tc1", name: "bash", args: { command: "ls" } },
      { id: "tc2", name: "edit" },
    ]);
  });

  it("toolCall 帧：start 名称与参数均无变化时返回原引用（密发帧不触发重渲染）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "ls" } }));
    const stable = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "ls" } }));
    expect(stable).toBe(state);
  });

  it("toolCall 帧：update 按 id 覆盖输出尾巴；start 丢失时忽略（瞬态帧可丢）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "update", id: "ghost", name: "bash", outputTail: "x", totalLen: 1 }));
    expect(state?.streamingToolCalls).toBeUndefined();
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash" }));
    state = applyServerFrame(state, event({ type: "toolCall", phase: "update", id: "tc1", name: "bash", outputTail: "部分输出", totalLen: 4 }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc1", name: "bash", outputTail: "部分输出", totalLen: 4 }]);
  });

  // end 帧丢失时的条目侧兜底：权威条目引用了正在指示的调用，指示随之熄灭（与草稿让位同权威语义）
  it("权威条目到达：引用该调用的 entry 清除 toolCall 指示，无关条目不清", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash" }));
    const toolResultEntry: SessionEntry = {
      type: "message",
      id: "tr1",
      parentId: null,
      timestamp: "T1",
      message: { role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [], isError: false },
    };
    state = applyServerFrame(state, event({ type: "entry", entry: toolResultEntry }));
    expect(state?.streamingToolCalls).toBeUndefined();

    // 其它引用（无关注解、别的调用）不清指示
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc2", name: "edit" }));
    const annotation: SessionEntry = { type: "compaction", id: "c9", parentId: null, timestamp: "T2", tokensBefore: 1 };
    state = applyServerFrame(state, event({ type: "entry", entry: annotation }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc2", name: "edit" }]);
    const otherResult: SessionEntry = {
      type: "message",
      id: "tr2",
      parentId: null,
      timestamp: "T3",
      message: { role: "toolResult", toolCallId: "other", toolName: "read", content: [], isError: false },
    };
    state = applyServerFrame(state, event({ type: "entry", entry: otherResult }));
    expect(state?.streamingToolCalls).toEqual([{ id: "tc2", name: "edit" }]);
    const assistantEntry: SessionEntry = {
      type: "message",
      id: "a1",
      parentId: null,
      timestamp: "T4",
      message: { role: "assistant", content: [{ type: "toolCall", id: "tc2", name: "edit", arguments: {} }] },
    };
    state = applyServerFrame(state, event({ type: "entry", entry: assistantEntry }));
    expect(state?.streamingToolCalls).toBeUndefined();
  });

  it("queue 帧：排队快照全量覆盖", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "queue", steering: ["一"], followUp: [] }));
    expect(state?.queued).toEqual({ steering: ["一"], followUp: [] });
    state = applyServerFrame(state, event({ type: "queue", steering: [], followUp: ["二", "三"] }));
    expect(state?.queued).toEqual({ steering: [], followUp: ["二", "三"] });
  });

  it("compaction 帧：start 亮起，end 回到缺省（与 idle 清口一致）", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "compaction", phase: "start", reason: "threshold" }));
    expect(state?.compacting).toBe(true);
    state = applyServerFrame(state, event({ type: "compaction", phase: "end", reason: "threshold" }));
    expect(state?.compacting).toBeUndefined();
  });

  // abort 等异常路径可能不发 tool_execution_end：回到 idle 是瞬态指示的最后兜底熄灭点
  it("回到 idle：全部瞬态指示一并清空", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "toolCall", phase: "start", id: "tc1", name: "bash" }));
    state = applyServerFrame(state, event({ type: "queue", steering: ["插话"], followUp: [] }));
    state = applyServerFrame(state, event({ type: "compaction", phase: "start", reason: "manual" }));
    const pending: DriveSession = { ...state!, pendingPrompt: "问" };
    expect(pending.streamingToolCalls).toBeDefined();
    expect(pending.queued).toBeDefined();
    expect(pending.compacting).toBe(true);
    const settled = applyServerFrame(pending, event({ type: "status", status: "idle", aborted: true }))!;
    expect(settled.status).toBe("idle");
    expect(settled.streamingToolCalls).toBeUndefined();
    expect(settled.queued).toBeUndefined();
    expect(settled.compacting).toBeUndefined();
    expect(settled.pendingPrompt).toBeUndefined();
  });

  it("released → 状态移除（undefined）", () => {
    let state: DriveSession | undefined = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, { type: "released", sessionId: "s1" });
    expect(state).toBeUndefined();
  });

  it("未 attach 先收到事件：防御性忽略", () => {
    expect(applyServerFrame(undefined, event({ type: "status", status: "running" }))).toBeUndefined();
  });

  // ===== ADR-0016/0017 扩展：目录、用量、待确认队列、重试计数 =====

  const catalog: ServerFrame = {
    type: "attached",
    sessionId: "s1",
    file: "f1.jsonl",
    catalog: {
      model: {
        models: [{ provider: "p", modelId: "m1", thinkingLevels: ["off", "medium"], contextWindow: 200000 }],
        current: { provider: "p", modelId: "m1" },
        thinkingLevel: "medium",
      },
      commands: [{ name: "commit", trigger: "/commit", source: "skill" }],
    },
  };

  it("attached 带 catalog：登记目录（Model Seat / Trigger Menu 数据源）", () => {
    const state = applyServerFrame(undefined, catalog);
    expect(state?.catalog?.model?.models).toHaveLength(1);
    expect(state?.catalog?.commands?.[0].trigger).toBe("/commit");
    // 不带 catalog 的 attached 重放不冲掉已登记目录
    expect(applyServerFrame(state, attachedBare)?.catalog).toEqual(state?.catalog);
  });

  it("usage 事件：登记快照；字段级同值引用不变（消息边界高频重推不触发重渲染）", () => {
    let state = applyServerFrame(undefined, catalog);
    const usageFrame = event({ type: "usage", usage: { tokens: 1000, contextWindow: 200000, percent: 0.5 } });
    state = applyServerFrame(state, usageFrame);
    expect(state?.usage?.tokens).toBe(1000);
    const before = state;
    state = applyServerFrame(state, usageFrame);
    expect(state).toBe(before);
  });

  it("usage 的 tokens 可为 null（刚压缩完内核暂不知），Context Ring 自行降级", () => {
    let state = applyServerFrame(undefined, catalog);
    state = applyServerFrame(state, event({ type: "usage", usage: { tokens: null, contextWindow: 200000, percent: null } }));
    expect(state?.usage?.tokens).toBeNull();
  });

  it("queue 帧：内核快照（权威）到达，本地 pendingQueue 让位", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "status", status: "running" }));
    const pending: DriveSession = { ...state!, pendingQueue: ["本地待确认"] };
    const next = applyServerFrame(pending, event({ type: "queue", steering: [], followUp: ["内核已收"] }))!;
    expect(next.queued).toEqual({ steering: [], followUp: ["内核已收"] });
    expect(next.pendingQueue).toBeUndefined();
  });

  it("status retrying：记录第 n 次尝试；离开 retrying 清零；回到 idle 连 pendingQueue 一并清空", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "status", status: "retrying", attempt: 2, detail: "超时" }));
    expect(state?.retryAttempt).toBe(2);
    state = applyServerFrame(state, event({ type: "status", status: "running" }));
    expect(state?.retryAttempt).toBeUndefined();
    state = applyServerFrame(state, event({ type: "status", status: "retrying", attempt: 3 }));
    const queued: DriveSession = { ...state!, pendingQueue: ["排队中"] };
    const settled = applyServerFrame(queued, event({ type: "status", status: "idle" }))!;
    expect(settled.pendingQueue).toBeUndefined();
    expect(settled.retryAttempt).toBeUndefined();
  });
});

describe("瞬态条目合成 · 喂给同一 buildTranscriptModel 出口（ADR-0012 补记七）", () => {
  // 回归点：草稿合成条目的 parentId 曾为 null——叶子扫描把它当成新根，
  // 流式期间整条真实分支被误判为「被弃」，transcript 塌缩成只剩草稿。
  it("草稿合成条目挂在传入的分支叶子上", () => {
    const [draft] = streamingEntries({ text: "答" }, undefined, "leaf-1");
    expect(draft.parentId).toBe("leaf-1");
  });

  // 验收反馈：运行中思考出现在正文下方（流序颠倒），权威条目落盘后又会翻回去
  it("草稿内容块按流序排列：思考先行、正文随后", () => {
    const [draft] = streamingEntries({ text: "答", thinking: "想" }, undefined, null);
    const blocks = ((draft as MessageEntry).message as AssistantMessage).content;
    expect(blocks.map((block) => block.type)).toEqual(["thinking", "text"]);
  });

  it("调用中指示合成为 toolCall 块：无配对结果即 running（模型层判定）；执行参数随块带入（补记八）", () => {
    const [draft] = streamingEntries(undefined, [{ id: "tc1", name: "bash", args: { command: "ls" } }], null);
    expect(((draft as MessageEntry).message as AssistantMessage).content).toEqual([
      { type: "toolCall", id: "tc1", name: "bash", arguments: { command: "ls" } },
    ]);
  });

  it("无草稿且无调用指示时返回空数组（视图层不知道「流式」存在）", () => {
    expect(streamingEntries(undefined, undefined, null)).toEqual([]);
  });

  it("pendingPromptEntries：空白文本不出条目，非空白合成挂叶子的 user 条目", () => {
    expect(pendingPromptEntries("   ", null)).toEqual([]);
    const [pending] = pendingPromptEntries("你好", "leaf-1");
    expect(pending.id).toBe(PENDING_PROMPT_ENTRY_ID);
    expect(pending.parentId).toBe("leaf-1");
    expect((pending as MessageEntry).message.role).toBe("user");
  });
});

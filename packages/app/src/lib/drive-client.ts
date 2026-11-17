// drive-client 纯逻辑核心（ADR-0012 阶段四）：ServerFrame 入 → 客户端状态出。
// 条目幂等合并是断线恢复的数据基础：REST 全量与 WS 事件流谁先到都收敛到同一集合，
// 最终汇入 buildTranscriptModel 出口（与 Live Tail 同一派生管线）。
import type {
  AssistantMessage,
  ContentBlock,
  MessageEntry,
  SessionEntry,
  SessionHeaderEntry,
  StreamingDraft,
  ToolResultMessage,
} from "@pi-studio/shared/pi-types";
import type { DriveEvent, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

/** 「调用中」指示的形状（协议 toolCall 帧的字段子集，状态与消费方共用同名形状）。
 *  args / outputTail 为执行期数据（ADR-0012 补记八）：并行调用各占集合一项 */
export interface StreamingToolCall {
  id: string;
  name: string;
  /** 仅执行期：完整参数（tool_execution_start 帧驱动） */
  args?: Record<string, unknown>;
  /** 仅执行中：已流出输出的文本尾部（toolCall update 帧驱动，瞬态可丢） */
  outputTail?: string;
  /** 仅执行中：输出全文长度（> outputTail.length = 输出仍在增长） */
  totalLen?: number;
}

/** 单个被驱动 Session 的客户端状态 */
export interface DriveSession {
  readonly sessionId: string;
  readonly status: DriveStatus;
  /** 内核回带/事件累积的条目；客户端渲染与 REST 全量按 id 幂等归并 */
  readonly entries: readonly SessionEntry[];
  /** 尚未落盘的那一段流式内容（delta 帧累积）；权威条目一到即清空（ADR-0012） */
  readonly streaming?: StreamingDraft;
  /** 正在流式/执行的工具调用集合（toolCall 帧驱动，start 顺序排列）：
   *  参数流式与执行期间的「调用中」指示；并行调用各占一项 */
  readonly streamingToolCalls?: readonly StreamingToolCall[];
  /** steer / followUp 待送达内容（queue 帧全量覆盖） */
  readonly queued?: { steering: string[]; followUp: string[] };
  /** 内核正在压缩上下文（compaction 帧驱动）：期间内核拒绝新 prompt；仅运行期为 true */
  readonly compacting?: boolean;
  /** 已发出 prompt 的待回显文本（GLOSSARY「Pending Echo」）：内核要等 assistant 的
      message_start 才回传权威 user 条目（ADR-0012 补记四），这段窗口由客户端先挂气泡，
      权威条目到达 / 回 idle / 出错即让位 */
  readonly pendingPrompt?: string;
  /** create 出的会话在首条消息前不落盘，header 只能来自 attach 回包 */
  readonly header?: SessionHeaderEntry;
  readonly lastError?: string;
}

/** 待送达插话/追问的总数（Composer 徽标等消费方的唯一派生点） */
export function queuedCountOf(session: DriveSession | undefined): number {
  return (session?.queued?.steering.length ?? 0) + (session?.queued?.followUp.length ?? 0);
}

/** 叠加条目的合成 id：只活在客户端内存里，绝不与内核条目 id 相撞（内核 id 为随机串） */
export const STREAMING_ENTRY_ID = "pi-studio:stream-draft";

/** 待回显条目的合成 id（与 STREAMING_ENTRY_ID 同纪律） */
export const PENDING_PROMPT_ENTRY_ID = "pi-studio:pending-prompt";

/** 把已发出的 prompt 合成一条挂在分支尾的 user 条目（GLOSSARY「Pending Echo」）。
 * 内核要等 assistant 的 message_start 才回传权威 user 条目（ADR-0012 补记四），
 * 这段窗口里它是内容区唯一的「已发出」凭证；parentId 传活动分支叶子（activeLeafId）。 */
export function pendingPromptEntries(text: string | undefined, parentId: string | null): SessionEntry[] {
  if (!text?.trim()) return [];
  return [
    {
      type: "message",
      id: PENDING_PROMPT_ENTRY_ID,
      parentId,
      timestamp: new Date().toISOString(),
      message: { role: "user", content: text },
    },
  ];
}

/** 把流式草稿合成成一条挂在活动分支尾部的 assistant 条目，喂给同一 buildTranscriptModel 出口。
 * 无草稿且无调用中指示时返回空数组——视图层因此不必知道「流式」这个概念（ADR-0002 渲染层零伪造）。
 * parentId 传活动分支叶子：挂空会被叶子扫描当成新根，整条真实分支反被判成「被弃」。 */
export function streamingEntries(
  draft: StreamingDraft | undefined,
  calling: readonly StreamingToolCall[] | undefined,
  parentId: string | null,
): SessionEntry[] {
  const text = draft?.text ?? "";
  const thinking = draft?.thinking ?? "";
  // 只丢弃纯空白：正文里可能已有换行等空白，但视图无内容可画
  if (!text.trim() && !thinking.trim() && (!calling || calling.length === 0)) {
    return [];
  }
  // 内容块按流序排列：思考先行、正文随后、调用中行殿后——
  // 顺序颠倒会让运行中的思考出现在正文下方，权威条目落盘后又会翻回去
  const content: ContentBlock[] = [];
  if (thinking.trim()) content.push({ type: "thinking", thinking });
  if (text.trim()) content.push({ type: "text", text });
  for (const call of calling ?? []) {
    // 执行期参数（ADR-0012 补记八）随草稿块进同一出口，运行行据此显示参数摘要
    content.push({ type: "toolCall", id: call.id, name: call.name, arguments: call.args ?? {} });
  }
  // stopReason 取 "pending"：这不是一次结束，视图层不得据此渲染 aborted / error 警告
  return [
    {
      type: "message",
      id: STREAMING_ENTRY_ID,
      parentId,
      // 计时锚随草稿生灭（delta 首帧起表，ADR-0014）：每轮从零起算、多会话互不串
      timestamp: draft?.anchorAt ?? new Date().toISOString(),
      message: { role: "assistant", content, stopReason: "pending" },
    },
  ];
}

/** 双源幂等归并：按 id 去重、先见顺序保留（REST 全量在前，驱动增量在后） */
export function mergeEntries(
  base: readonly SessionEntry[],
  incoming: readonly SessionEntry[],
): readonly SessionEntry[] {
  if (incoming.length === 0) return base;
  const seen = new Set(base.map((e) => e.id));
  const appended = incoming.filter((e) => !seen.has(e.id));
  if (appended.length === 0) return base;
  return [...base, ...appended];
}

/** 应用一帧服务端消息；released 返回 undefined（状态移除） */
export function applyServerFrame(
  prev: DriveSession | undefined,
  frame: ServerFrame,
): DriveSession | undefined {
  switch (frame.type) {
    case "attached": {
      // 重连 re-attach 会重复到达：条目按 id 幂等，header 后到者为准
      const base = prev ?? { sessionId: frame.sessionId, status: "idle" as const, entries: [] };
      const merged = mergeEntries(base.entries, frame.entries ?? []);
      const header = frame.header ?? base.header;
      // attach（无快照）时 merged/header 都不变，但 prev 可能是 undefined——
      // 此时仍得登记这个 session，否则驱动表里永远没有它
      if (prev && merged === base.entries && header === base.header) return prev;
      return { ...base, entries: merged, header };
    }
    case "released":
      return undefined;
    case "event":
      return applyEvent(prev, frame.event);
    case "commandFailed":
      // 命令被拒（未接管 / 坏帧等）：prompt 不会再有权威回显，待回显一并让位
      return prev && { ...prev, lastError: frame.message, pendingPrompt: undefined };
    case "disposition":
      // 瞬态排队应答：不入状态
      return prev;
    default:
      return prev;
  }
}

function applyEvent(prev: DriveSession | undefined, event: DriveEvent): DriveSession | undefined {
  if (!prev) return undefined; // 未 attach 先收到事件：防御性忽略
  switch (event.body.type) {
    case "entry": {
      const entries = mergeEntries(prev.entries, [event.body.entry]);
      // 权威条目落盘 = 内核已有该内容的权威副本：草稿整体让位，避免同一句渲染两份。
      // 消息条目必然出自内核，因此这里绝不能按正文比对（权威条目可能不是这里累积的那段）
      const streaming = entries === prev.entries && prev.streaming ? prev.streaming : undefined;
      // 权威条目引用了正在指示的工具调用（assistant 条目含该调用块 / toolResult 配对到达）：
      // 对应项随之熄灭——end 帧丢失时的条目侧兜底（与草稿让位同一权威语义）
      const streamingToolCalls = filterRetiredCalls(prev.streamingToolCalls, event.body.entry);
      // 新到权威 user 条目 = 已发 prompt 的回显（内核要等 assistant 的 message_start 才回传）：
      // 本地待回显随之让位；重复条目（重放）不动引用
      const pendingPrompt =
        entries !== prev.entries && isUserEntry(event.body.entry) ? undefined : prev.pendingPrompt;
      if (
        entries === prev.entries &&
        streaming === prev.streaming &&
        streamingToolCalls === prev.streamingToolCalls &&
        pendingPrompt === prev.pendingPrompt
      )
        return prev; // 幂等命中：引用不变
      return { ...prev, entries, streaming, streamingToolCalls, pendingPrompt };
    }
    case "status": {
      const status = event.body.status;
      // 回到 idle：全部瞬态指示失去宿主，一并清空（abort 等异常路径的兜底熄灭点）
      return status === "idle"
        ? {
            ...prev,
            status,
            streamingToolCalls: undefined,
            queued: undefined,
            compacting: undefined,
            pendingPrompt: undefined,
          }
        : { ...prev, status };
    }
    case "error":
      // prompt 被内核拒绝等：不会再有权威回显，待回显一并让位
      return { ...prev, lastError: event.body.message, pendingPrompt: undefined };
    case "delta": {
      // 瞬态打字机增量：整轮累积在这里，权威条目到达前先给视图一层可动的草稿。
      // 空 delta 不改引用（下游以此跳过重渲染）
      const delta = event.body.delta;
      if (!delta) return prev;
      const field = event.body.field;
      // 正文一开流思考必然已完（ADR-0012 补记九）：thinkingEnd 帧丢失时的兜底判据
      const thinkingComplete =
        field === "text" && (prev.streaming?.thinkingComplete || (prev.streaming?.thinking?.length ?? 0) > 0)
          ? true
          : prev.streaming?.thinkingComplete;
      // 计时锚随草稿生灭：首个 delta 起表，权威条目落盘（草稿清空）后下轮重新起表——
      // 每次都取 new Date() 会让锚跟着挂钟跑，思考行/头部秒数恒为 0（迭代反馈修复）
      const anchorAt = prev.streaming?.anchorAt ?? new Date().toISOString();
      return {
        ...prev,
        streaming: {
          ...prev.streaming,
          anchorAt,
          ...(thinkingComplete ? { thinkingComplete } : {}),
          [field]: (prev.streaming?.[field] ?? "") + delta,
        },
      };
    }
    case "thinkingEnd": {
      // 思考定稿（内核 thinking_end）：粘滞标志，草稿清空（权威条目落盘）时一并重置。
      // streaming 未建也要容下标志（补记九的容忍承诺）：redacted thinking 无 delta 直达
      // thinking_end，标志先落，此后首个 delta 才在真草稿上沿用它
      if (prev.streaming?.thinkingComplete) return prev;
      return { ...prev, streaming: { ...prev.streaming, thinkingComplete: true } };
    }
    case "toolCall": {
      const body = event.body;
      const calls = prev.streamingToolCalls ?? [];
      if (body.phase === "start") {
        // start：同 id 原位覆盖——流式声明 → 参数流 → 执行开始会连发多帧（ADR-0012
        // 补记十），参数以后到者为准；原位更新保源序（挪尾会让活跃调用挤到队尾，
        // 运行行顺序抖动）。名称与参数均无变化时返回原引用，参数流密发帧不触发重渲染
        const index = calls.findIndex((call) => call.id === body.id);
        if (index >= 0) {
          const current = calls[index];
          const args = body.args ?? current.args;
          if (current.name === body.name && sameJson(current.args, args)) return prev;
          const next = [...calls];
          next[index] = { id: body.id, name: body.name, ...(args ? { args } : {}) };
          return { ...prev, streamingToolCalls: next };
        }
        return {
          ...prev,
          streamingToolCalls: [...calls, { id: body.id, name: body.name, ...(body.args ? { args: body.args } : {}) }],
        };
      }
      if (body.phase === "update") {
        // update：按 id 覆盖输出尾巴；start 丢失（帧乱序/丢失）时忽略——瞬态帧可丢
        const index = calls.findIndex((call) => call.id === body.id);
        if (index < 0 || body.outputTail === undefined) return prev;
        const current = calls[index];
        if (current.outputTail === body.outputTail && current.totalLen === body.totalLen) return prev;
        const next = [...calls];
        next[index] = { ...current, outputTail: body.outputTail, totalLen: body.totalLen };
        return { ...prev, streamingToolCalls: next };
      }
      // end：按 id 匹配才移除（一轮多个工具，迟到的 end 不得影响别的调用）
      const next = calls.filter((call) => call.id !== body.id);
      if (next.length === calls.length) return prev;
      return { ...prev, streamingToolCalls: next.length > 0 ? next : undefined };
    }
    case "queue":
      return { ...prev, queued: { steering: event.body.steering, followUp: event.body.followUp } };
    case "compaction":
      // 仅运行期为 true，结束回到缺省（与 idle 清口一致，「无压缩」只有一种表示）
      return { ...prev, compacting: event.body.phase === "start" ? true : undefined };
    default:
      return prev;
  }
}

/** 是否 user 消息条目（待回显让位的判定依据） */
function isUserEntry(entry: SessionEntry): boolean {
  return entry.type === "message" && (entry as MessageEntry).message.role === "user";
}

/** JSON 同形比较（null/undefined 同义）：参数流密发帧的去重判据——键序敏感，
 *  序异值同只会多一次重渲染，无害 */
function sameJson(a: unknown, b: unknown): boolean {
  const ta = a == null ? "null" : JSON.stringify(a);
  const tb = b == null ? "null" : JSON.stringify(b);
  return ta === tb;
}

/** 条目是否引用了某次工具调用：assistant 条目含该调用块，或 toolResult 与之配对 */
function entryMentionsToolCall(entry: SessionEntry, toolCallId: string): boolean {  if (entry.type !== "message") return false;
  const message = (entry as MessageEntry).message;
  if (message.role === "toolResult") return (message as ToolResultMessage).toolCallId === toolCallId;
  if (message.role === "assistant") {
    return (message as AssistantMessage).content.some(
      (block) => block.type === "toolCall" && block.id === toolCallId,
    );
  }
  return false;
}

/** 权威条目到达后的调用集合熄灭：引用了该条目的调用移除，其余保留（无引用时引用不变） */
function filterRetiredCalls(
  calls: readonly StreamingToolCall[] | undefined,
  entry: SessionEntry,
): readonly StreamingToolCall[] | undefined {
  if (!calls || calls.length === 0) return calls;
  const next = calls.filter((call) => !entryMentionsToolCall(entry, call.id));
  if (next.length === calls.length) return calls;
  return next.length > 0 ? next : undefined;
}

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

/** 「调用中」指示的形状（协议 toolCall 帧的字段子集，状态与消费方共用同名形状） */
export interface StreamingToolCall {
  id: string;
  name: string;
}

/** 单个被驱动 Session 的客户端状态 */
export interface DriveSession {
  readonly sessionId: string;
  readonly status: DriveStatus;
  /** 内核回带/事件累积的条目；客户端渲染与 REST 全量按 id 幂等归并 */
  readonly entries: readonly SessionEntry[];
  /** 尚未落盘的那一段流式内容（delta 帧累积）；权威条目一到即清空（ADR-0012） */
  readonly streaming?: StreamingDraft;
  /** 正在流式/执行的工具调用（toolCall 帧驱动）：参数流式与执行期间的「调用中」指示 */
  readonly streamingToolCall?: StreamingToolCall;
  /** steer / followUp 待送达内容（queue 帧全量覆盖） */
  readonly queued?: { steering: string[]; followUp: string[] };
  /** 内核正在压缩上下文（compaction 帧驱动）：期间内核拒绝新 prompt；仅运行期为 true */
  readonly compacting?: boolean;
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

/** 把流式草稿合成成一条挂在活动分支尾部的 assistant 条目，喂给同一 buildTranscriptModel 出口。
 * 无草稿时返回空数组——视图层因此不必知道「流式」这个概念（ADR-0002 渲染层零伪造）。 */
export function streamingEntries(draft: StreamingDraft | undefined): SessionEntry[] {
  const text = draft?.text ?? "";
  const thinking = draft?.thinking ?? "";
  // 只丢弃纯空白：正文里可能已有换行等空白，但视图无内容可画
  if (!text.trim() && !thinking.trim()) return [];
  const content: ContentBlock[] = [];
  if (text.trim()) content.push({ type: "text", text });
  if (thinking.trim()) content.push({ type: "thinking", thinking });
  // stopReason 取 "pending"：这不是一次结束，视图层不得据此渲染 aborted / error 警告
  return [
    {
      type: "message",
      id: STREAMING_ENTRY_ID,
      parentId: null,
      timestamp: new Date(0).toISOString(),
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
      return prev && { ...prev, lastError: frame.message };
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
      // 「调用中」指示随之熄灭——end 帧丢失时的条目侧兜底（与草稿让位同一权威语义）
      const streamingToolCall =
        prev.streamingToolCall && entryMentionsToolCall(event.body.entry, prev.streamingToolCall.id)
          ? undefined
          : prev.streamingToolCall;
      if (entries === prev.entries && streaming === prev.streaming && streamingToolCall === prev.streamingToolCall)
        return prev; // 幂等命中：引用不变
      return { ...prev, entries, streaming, streamingToolCall };
    }
    case "status": {
      const status = event.body.status;
      // 回到 idle：全部瞬态指示失去宿主，一并清空（abort 等异常路径的兜底熄灭点）
      return status === "idle"
        ? {
            ...prev,
            status,
            streamingToolCall: undefined,
            queued: undefined,
            compacting: undefined,
          }
        : { ...prev, status };
    }
    case "error":
      return { ...prev, lastError: event.body.message };
    case "delta": {
      // 瞬态打字机增量：整轮累积在这里，权威条目到达前先给视图一层可动的草稿。
      // 空 delta 不改引用（下游以此跳过重渲染）
      const delta = event.body.delta;
      if (!delta) return prev;
      const field = event.body.field;
      return { ...prev, streaming: { ...prev.streaming, [field]: (prev.streaming?.[field] ?? "") + delta } };
    }
    case "toolCall": {
      if (event.body.phase === "start") {
        const streamingToolCall = { id: event.body.id, name: event.body.name };
        if (prev.streamingToolCall?.id === streamingToolCall.id && prev.streamingToolCall.name === streamingToolCall.name)
          return prev;
        return { ...prev, streamingToolCall };
      }
      // end：按 id 匹配才熄灭（一轮多个工具，迟到的 end 不得灭掉后来的 start）
      if (prev.streamingToolCall?.id !== event.body.id) return prev;
      return { ...prev, streamingToolCall: undefined };
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

/** 条目是否引用了某次工具调用：assistant 条目含该调用块，或 toolResult 与之配对 */
function entryMentionsToolCall(entry: SessionEntry, toolCallId: string): boolean {
  if (entry.type !== "message") return false;
  const message = (entry as MessageEntry).message;
  if (message.role === "toolResult") return (message as ToolResultMessage).toolCallId === toolCallId;
  if (message.role === "assistant") {
    return (message as AssistantMessage).content.some(
      (block) => block.type === "toolCall" && block.id === toolCallId,
    );
  }
  return false;
}

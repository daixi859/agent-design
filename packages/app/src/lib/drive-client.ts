// drive-client 纯逻辑核心（ADR-0012 阶段四）：ServerFrame 入 → 客户端状态出。
// 条目幂等合并是断线恢复的数据基础：REST 全量与 WS 事件流谁先到都收敛到同一集合，
// 最终汇入 buildTranscriptModel 出口（与 Live Tail 同一派生管线）。
import type { ContentBlock, SessionEntry, SessionHeaderEntry, StreamingDraft } from "@pi-studio/shared/pi-types";
import type { DriveEvent, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

/** 单个被驱动 Session 的客户端状态 */
export interface DriveSession {
  readonly sessionId: string;
  readonly status: DriveStatus;
  /** 内核回带/事件累积的条目；客户端渲染与 REST 全量按 id 幂等归并 */
  readonly entries: readonly SessionEntry[];
  /** 尚未落盘的那一段流式内容（delta 帧累积）；权威条目一到即清空（ADR-0012） */
  readonly streaming?: StreamingDraft;
  /** create 出的会话在首条消息前不落盘，header 只能来自 attach 回包 */
  readonly header?: SessionHeaderEntry;
  readonly lastError?: string;
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
      if (entries === prev.entries && streaming === prev.streaming) return prev; // 幂等命中：引用不变
      return { ...prev, entries, streaming };
    }
    case "status":
      return { ...prev, status: event.body.status };
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
    default:
      return prev;
  }
}

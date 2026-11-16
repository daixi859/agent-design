// drive-client 纯逻辑核心（ADR-0012 阶段四）：ServerFrame 入 → 客户端状态出。
// 条目幂等合并是断线恢复的数据基础：REST 全量与 WS 事件流谁先到都收敛到同一集合，
// 最终汇入 buildTranscriptModel 出口（与 Live Tail 同一派生管线）。
import type { SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type { DriveEvent, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

/** 单个被驱动 Session 的客户端状态 */
export interface DriveSession {
  readonly sessionId: string;
  readonly status: DriveStatus;
  /** 内核回带/事件累积的条目；客户端渲染与 REST 全量按 id 幂等归并 */
  readonly entries: readonly SessionEntry[];
  /** create 出的会话在首条消息前不落盘，header 只能来自 attach 回包 */
  readonly header?: SessionHeaderEntry;
  readonly lastError?: string;
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
      // 幂等命中时整态引用不变（跳过下游重渲染）
      return entries === prev.entries ? prev : { ...prev, entries };
    }
    case "status":
      return { ...prev, status: event.body.status };
    case "error":
      return { ...prev, lastError: event.body.message };
    case "delta":
      // 瞬态打字机增量：阶段一不落状态（transcript 由权威条目驱动）
      return prev;
    default:
      return prev;
  }
}

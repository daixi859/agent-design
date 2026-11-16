// drive-client 纯逻辑核心（ADR-0012 阶段四）：ServerFrame 入 → 客户端状态出。
// 条目幂等合并是断线恢复的数据基础：REST 全量与 WS 事件流谁先到都收敛到同一集合，
// 最终汇入 buildTranscriptModel 出口（与 Live Tail 同一派生管线）。
import type { SessionEntry } from "@pi-studio/shared/pi-types";
import type { DriveEvent, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

/** 单个被驱动 Session 的客户端状态 */
export interface DriveSession {
  readonly sessionId: string;
  readonly status: DriveStatus;
  readonly entries: readonly SessionEntry[];
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
    case "attached":
      // 重连 re-attach 会重复到达：已有状态原样保留（条目靠 id 幂等，不清基线）
      return prev ?? { sessionId: frame.sessionId, status: "idle", entries: [] };
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

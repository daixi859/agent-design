/** Live Tail 的会话内追新状态机（Q17 契约的客户端半边）：
    持有 entries + offset，保证 append-only 与 offset 单调推进，
    TranscriptModel 只在追加发生时重算。hook（useSessionDetail）只做取数、定时与订阅。 */
import type { SessionDetail, SessionEntry, TailResponse } from "@pi-studio/shared/pi-types";
import { buildTranscriptModel, type TranscriptModel } from "./transcript-model";

export interface SessionTail {
  /** 当前派生视图（只在追新发生时重算，未追新时引用稳定） */
  readonly view: TranscriptModel;
  /** 下次轮询应使用的字节偏移 */
  readonly offset: number;
  /** 应用一次 tail 响应；有新条目时返回 true（view 已随之更新） */
  apply(response: TailResponse): boolean;
}

export function createSessionTail(detail: SessionDetail): SessionTail {
  let entries: SessionEntry[] = detail.entries;
  let offset = detail.offset;
  let view = buildTranscriptModel(entries);

  return {
    get view() {
      return view;
    },
    get offset() {
      return offset;
    },
    apply(response: TailResponse): boolean {
      offset = response.offset;
      if (response.entries.length === 0) return false;
      entries = [...entries, ...response.entries];
      view = buildTranscriptModel(entries);
      return true;
    },
  };
}

/** Session 详情状态：首载全量 + Live Tail 增量追新（Q17：1.5s 轮询、字节偏移续读） */
import { useEffect, useRef, useState } from "react";
import type { SessionEntry, SessionHeaderEntry } from "../../shared/pi-types";
import { fetchSession, tailSession } from "../lib/pi-client";
import {
  buildActiveBranch,
  computeSessionStats,
  lastModelOnBranch,
  type ActiveBranch,
  type SessionStats,
} from "../lib/session-model";

export interface SessionDetailState {
  loading: boolean;
  error?: string;
  header?: SessionHeaderEntry;
  branch: ActiveBranch;
  stats: SessionStats;
  model?: { provider?: string; modelId?: string };
  /** 最近一次 thinking_level_change（Composer 徽标） */
  thinkingLevel?: string;
}

const EMPTY_BRANCH: ActiveBranch = { entries: [], abandonedCount: 0 };
const ZERO_STATS: SessionStats = {
  assistantMessages: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  costTotal: 0,
};

function derive(header: SessionHeaderEntry | undefined, entries: SessionEntry[]): SessionDetailState {
  const branch = buildActiveBranch(entries);
  let thinkingLevel: string | undefined;
  for (const entry of branch.entries) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = (entry as { thinkingLevel?: string }).thinkingLevel;
    }
  }
  return {
    loading: false,
    header,
    branch,
    stats: computeSessionStats(branch.entries),
    model: lastModelOnBranch(branch.entries),
    thinkingLevel,
  };
}

export function useSessionDetail(id: string | undefined): SessionDetailState {
  const [state, setState] = useState<SessionDetailState>({
    loading: !!id,
    branch: EMPTY_BRANCH,
    stats: ZERO_STATS,
  });
  // tail 追加走 ref，避免闭包过期；分支派生只在 setState 时重算
  const entriesRef = useRef<SessionEntry[]>([]);
  const headerRef = useRef<SessionHeaderEntry | undefined>(undefined);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    fetchSession(id)
      .then((detail) => {
        if (cancelled) return;
        entriesRef.current = detail.entries;
        headerRef.current = detail.header;
        offsetRef.current = detail.offset;
        setState(derive(detail.header, detail.entries));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      tailSession(id, offsetRef.current)
        .then((tail) => {
          offsetRef.current = tail.offset;
          if (tail.entries.length === 0) return;
          entriesRef.current = [...entriesRef.current, ...tail.entries];
          setState(derive(headerRef.current, entriesRef.current));
        })
        .catch(() => {
          // 瞬态失败（文件重建中等）忽略，下轮重试
        });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [id]);

  return state;
}

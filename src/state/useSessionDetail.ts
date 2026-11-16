/** Session 详情状态：首载全量 + Live Tail 增量追新（Q17：1.5s 轮询）。
    追新状态机在 src/lib/session-tail——本 module 只做取数、定时与订阅。 */
import { useEffect, useRef, useState } from "react";
import type { SessionHeaderEntry } from "../../shared/pi-types";
import { fetchSession, tailSession } from "../lib/pi-client";
import { createSessionTail, type SessionTail } from "../lib/session-tail";
import { buildTranscriptModel, type TranscriptModel } from "../lib/transcript-model";

export interface SessionDetailState {
  loading: boolean;
  error?: string;
  header?: SessionHeaderEntry;
  view: TranscriptModel;
}

const EMPTY_VIEW = buildTranscriptModel([]);

export function useSessionDetail(id: string | undefined): SessionDetailState {
  const [state, setState] = useState<SessionDetailState>({ loading: !!id, view: EMPTY_VIEW });
  const tailRef = useRef<SessionTail | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tailRef.current = null; // 清空旧 session 的状态机：新详情未决期间轮询空转，防串档
    setState({ loading: true, view: EMPTY_VIEW });
    fetchSession(id)
      .then((detail) => {
        if (cancelled) return;
        const tail = createSessionTail(detail);
        tailRef.current = tail;
        setState({ loading: false, header: detail.header, view: tail.view });
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
      const tail = tailRef.current;
      if (!tail) return;
      tailSession(id, tail.offset)
        .then((response) => {
          if (tail.apply(response)) {
            setState((prev) => ({ ...prev, view: tail.view }));
          }
        })
        .catch(() => {
          // 瞬态失败（文件重建中等）忽略，下轮重试
        });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [id]);

  return state;
}

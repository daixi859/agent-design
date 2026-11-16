/** Session 详情状态：首载全量 + 增量追新（ADR-0012）。
    两种增量源，互斥切换：被驱动（Drive）的 session 走 WS 事件流（Live Tail 对其失效），
    其余 session 维持 Live Tail 轮询。两源条目按 id 幂等归并后经同一 buildTranscriptModel 出口。 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import { fetchSession, tailSession } from "../lib/pi-client";
import { createSessionTail, type SessionTail } from "../lib/session-tail";
import { buildTranscriptModel, type TranscriptModel } from "../lib/transcript-model";
import { mergeEntries } from "../lib/drive-client";
import { drive, useDriveSession } from "./use-drive";

export interface SessionDetailState {
  loading: boolean;
  error?: string;
  header?: SessionHeaderEntry;
  view: TranscriptModel;
  /** 被驱动时非空：驱动状态与动作随组件树下发（sessionId 即当前路由 id） */
  drive?: { status: DriveStatusMeta };
}

/** 避免直接暴露协议类型名给展示层以外的模块引用 */
type DriveStatusMeta = "idle" | "running" | "retrying";

const EMPTY_VIEW = buildTranscriptModel([]);

export function useSessionDetail(id: string | undefined): SessionDetailState {
  const [state, setState] = useState<SessionDetailState>({ loading: !!id, view: EMPTY_VIEW });
  const tailRef = useRef<SessionTail | null>(null);
  const detailRef = useRef<{ header?: SessionHeaderEntry; entries: SessionDetailEntries } | null>(null);
  const driveSession = useDriveSession(id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tailRef.current = null; // 清空旧 session 的状态机：新详情未决期间轮询空转，防串档
    detailRef.current = null;
    setState({ loading: true, view: EMPTY_VIEW });
    fetchSession(id)
      .then((detail) => {
        if (cancelled) return;
        const tail = createSessionTail(detail);
        tailRef.current = tail;
        detailRef.current = { header: detail.header, entries: detail.entries };
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

  // Live Tail 轮询：仅未被驱动的 session（GLOSSARY: 被 Drive 的 session 不经 Live Tail）
  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      if (drive.isDriven(id)) return;
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

  // 驱动覆盖视图：REST 全量 × WS 增量按 id 幂等归并（引用稳定，未变不重算）。
  // 依赖含 state：attached 先于 fetch 完成到达时，memo 需随 fetch 落地重算，否则永久冻结在非驱动分支。
  const drivenView = useMemo(() => {
    const detail = detailRef.current;
    if (!driveSession || !detail || state.loading) return undefined;
    return buildTranscriptModel([...mergeEntries(detail.entries, driveSession.entries)]);
  }, [driveSession, state]);

  if (drivenView && state.header) {
    return { ...state, view: drivenView, drive: { status: driveSession!.status } };
  }
  return state;
}

type SessionDetailEntries = Awaited<ReturnType<typeof fetchSession>>["entries"];

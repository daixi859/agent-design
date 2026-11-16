/** Session 详情状态：首载全量 + 增量追新（ADR-0012）。
    两种基线来源：
      · 已落盘会话 → REST 全量（Live Tail 轮询供增量）
      · create 出的新会话 → 只在 WS attached 回包的快照里（首条消息前文件不落盘，REST 会 404）
    增量来源唯一：WS 驱动事件流；被驱动的 session 停用 Live Tail。
    两源条目按 id 幂等归并后经同一 buildTranscriptModel 出口。

    基线放 state（而非 ref）：它必须引发重渲染，否则 attached 先于 REST 落地时
    drivenView 会被永久缓存为 undefined（ADR-0012 补记第 3 条）。
    驱动视图的合成与记忆化在 lib/driven-view.ts（按参数身份缓存，调用侧没有依赖数组可写错）。 */
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@pi-studio/shared/errors";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import { fetchSession, tailSession } from "../lib/pi-client";
import { createSessionTail, type SessionTail } from "../lib/session-tail";
import { buildTranscriptModel, type TranscriptModel } from "../lib/transcript-model";
import { resolveDrivenView } from "../lib/driven-view";
import type { DriveSession } from "../lib/drive-client";
import { drive, useDriveSession } from "./use-drive";

export interface SessionDetailState {
  loading: boolean;
  error?: string;
  header?: SessionSnapshot["header"];
  view: TranscriptModel;
  /** 被驱动时非空：驱动状态、瞬态指示与动作随组件树下发（sessionId 即当前路由 id） */
  drive?: DriveSession;
}

const EMPTY_VIEW = buildTranscriptModel([]);

export function useSessionDetail(id: string | undefined): SessionDetailState {
  const [state, setState] = useState<SessionDetailState>({ loading: !!id, view: EMPTY_VIEW });
  /** REST 基线（响应式：驱动视图的 memo 依赖它） */
  const [baseline, setBaseline] = useState<SessionSnapshot | null>(null);
  const tailRef = useRef<SessionTail | null>(null);
  const driveSession = useDriveSession(id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    tailRef.current = null; // 清空旧 session 的状态机：新详情未决期间轮询空转，防串档
    setBaseline(null);
    setState({ loading: true, view: EMPTY_VIEW });

    fetchSession(id)
      .then((detail) => {
        if (cancelled) return;
        const tail = createSessionTail(detail);
        tailRef.current = tail;
        setBaseline({ header: detail.header, entries: [...detail.entries] });
        setState({ loading: false, header: detail.header, view: tail.view });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // 未落盘的 create 会话：REST 404 属预期，基线等 attached 回包（下方 effect 兜底）
        const attached = drive.getSnapshot().get(id);
        if (attached?.header) {
          setBaseline({ header: attached.header, entries: [...attached.entries] });
          setState({ loading: false, header: attached.header, view: EMPTY_VIEW });
          return;
        }
        setState((prev) => ({ ...prev, loading: false, error: errorMessage(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // create 会话的基线兜底：attached 回包带了 header 而 REST 尚无基线时，用它落地
  useEffect(() => {
    if (!id || !driveSession?.header || baseline) return;
    setBaseline({ header: driveSession.header, entries: [...driveSession.entries] });
    setState((prev) => ({ ...prev, loading: false, error: undefined, header: driveSession.header }));
  }, [id, driveSession?.header, driveSession?.entries, baseline]);

  // Live Tail 轮询：仅未被驱动且已有 REST 基线的 session（GLOSSARY: 被 Drive 的 session 不经 Live Tail）
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

  // 驱动覆盖视图：基线 × 驱动条目按 id 幂等归并（记忆化在 lib 内按参数身份，见 driven-view.ts）
  const drivenView = resolveDrivenView(driveSession, baseline);

  if (driveSession && baseline && drivenView) {
    return {
      loading: false,
      header: baseline.header,
      view: drivenView,
      drive: driveSession,
    };
  }
  return state;
}

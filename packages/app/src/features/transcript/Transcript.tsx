/** Transcript：对话区本体（ADR-0006 三级结构，ADR-0013 收敛为两级：Turn / Process Group；数据直收 TranscriptModel） */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { TranscriptModel } from "../../lib/transcript-model";
import type { ComposerDrive } from "./Composer";
import { Icon } from "../../ui/Icon";
import { AnnotationRow } from "./AnnotationRow";
import { Composer } from "./Composer";
import { TurnView } from "./TurnView";
import { useLocale } from "../../state/useLocale";
import styles from "./transcript.module.css";

export function Transcript({
  projectPath,
  view,
  drive,
  live = false,
}: {
  projectPath?: string;
  view: TranscriptModel;
  /** 会话被驱动时由 SessionView 下发：输入区激活、状态徽标与中止 */
  drive?: ComposerDrive;
  /** 会话正在运行（驱动中且非 idle） */
  live?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const { t } = useLocale();

  // 单一列宽轴（ADR-0013）：把容器实际宽度发布成 --pane-width，
  // 内容列宽由 clamp(680px, pane × 0.64, 920px) 派生；未发布时退回 760px 等效值。
  const [paneWidth, setPaneWidth] = useState<number>();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width) setPaneWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { turns, orphanAnnotations } = view;
  // 末轮即当前生成中的那一轮：只有它值得默认展开（历史轮展开会撑开整篇对话）
  const lastTurnId = turns.at(-1)?.id;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = nearBottom;
    setShowJump(!nearBottom && el.scrollHeight > el.clientHeight + 120);
  }, []);

  // Live Tail 追新时自动跟随（Q17：仅在用户贴底时）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [view]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  return (
    <div
      className={styles.wrap}
      style={paneWidth ? ({ "--pane-width": `${paneWidth}px` } as CSSProperties) : undefined}
    >
      {/* 底部 Composer 与滚动区共用一个列宽轴 */}
      <div className={`scroll-y ${styles.scroll}`} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.inner}>
          {projectPath && <p className={styles.projectEyebrow}>{projectPath}</p>}
          {orphanAnnotations.map((entry) => (
            <AnnotationRow key={entry.id} entry={entry} />
          ))}
          {turns.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="sparkles" size={28} />
              <strong>{t("emptyBranchTitle")}</strong>
              <span>{t("emptyBranchHint")}</span>
            </div>
          ) : (
            turns.map((turn) => (
              // 驱动中且是末轮才视为「生成中」：REST/Live Tail 浏览路径不改变既有折叠行为
              <TurnView key={turn.id} turn={turn} live={live && turn.id === lastTurnId} />
            ))
          )}
        </div>
      </div>

      {showJump && (
        <button type="button" className={styles.jumpLatest} onClick={jumpToLatest}>
          <Icon name="arrow-down" size={13} />
          {t("jumpLatest")}
        </button>
      )}

      <Composer
        model={view.model?.modelId}
        thinkingLevel={view.thinkingLevel}
        toolCount={view.toolCallCount}
        drive={drive}
      />
    </div>
  );
}

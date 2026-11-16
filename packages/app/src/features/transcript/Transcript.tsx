/** Transcript：对话区本体（ADR-0006：Turn / Tool Group 三层折叠结构；数据直收 TranscriptModel） */
import { useCallback, useEffect, useRef, useState } from "react";
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
}: {
  projectPath?: string;
  view: TranscriptModel;
  /** 会话被驱动时由 SessionView 下发：输入区激活、状态徽标与中止 */
  drive?: ComposerDrive;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const { t } = useLocale();

  const { turns, orphanAnnotations } = view;

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
    <div className={styles.wrap}>
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
            turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
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

/** Transcript：对话区本体（ADR-0006：Turn / Tool Group 三层折叠结构） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionEntry } from "../../../shared/pi-types";
import { buildTurns } from "../../lib/session-model";
import { Icon } from "../../ui/Icon";
import { AnnotationRow } from "./AnnotationRow";
import { Composer } from "./Composer";
import { TurnView } from "./TurnView";
import { useLocale } from "../../state/useLocale";
import styles from "./transcript.module.css";

export function Transcript({
  projectPath,
  branch,
  stats,
  model,
  thinkingLevel,
}: {
  projectPath?: string;
  branch: SessionEntry[];
  stats: { toolCalls: number };
  model?: { provider?: string; modelId?: string };
  thinkingLevel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const { t } = useLocale();

  const { turns, orphanAnnotations } = useMemo(() => buildTurns(branch), [branch]);

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
  }, [branch]);

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
        model={model?.modelId}
        thinkingLevel={thinkingLevel}
        toolCount={stats.toolCalls}
      />
    </div>
  );
}

/** Composer：视觉件（ADR-0002 只读边界）——下一阶段接入 pi 的 prompt/steer 后启用 */
import { Icon } from "../../ui/Icon";
import styles from "./transcript.module.css";

export function Composer({
  model,
  thinkingLevel,
  toolCount,
  variant = "overlay",
}: {
  model?: string;
  thinkingLevel?: string;
  toolCount?: number;
  /** overlay：钉在 Transcript 底部；docked：文档流内（组件总览用） */
  variant?: "overlay" | "docked";
}) {
  return (
    <div className={variant === "overlay" ? styles.composer : styles.composerDocked}>
      <div className={styles.composerCard}>
        {/* 只读阶段禁用交互；发送为视觉态 */}
        <textarea
          className={styles.composerInput}
          placeholder="Message pi…"
          rows={1}
          disabled
          aria-disabled="true"
        />
        <div className={styles.composerBar}>
          {model && (
            <span className={styles.composerPill} title="Model">
              <Icon name="sparkles" size={11} />
              {model}
            </span>
          )}
          {thinkingLevel && (
            <span className={styles.composerPill} title="Thinking level">
              {thinkingLevel}
            </span>
          )}
          {typeof toolCount === "number" && toolCount > 0 && (
            <span className={styles.composerPill} title="Tools used">
              {toolCount} tools
            </span>
          )}
          <button
            type="button"
            className={styles.sendButton}
            title="下一阶段接入 pi 后启用"
            aria-disabled="true"
            tabIndex={-1}
          >
            <Icon name="arrow-up" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

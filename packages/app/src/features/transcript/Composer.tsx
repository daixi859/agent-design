/** Composer：视觉件（ADR-0002 只读边界）——下一阶段接入 pi 的 prompt/steer 后启用 */
import { Icon } from "../../ui/Icon";
import { useLocale } from "../../state/useLocale";
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
  const { t } = useLocale();
  return (
    <div className={variant === "overlay" ? styles.composer : styles.composerDocked}>
      <div className={styles.composerCard}>
        {/* 只读阶段禁用交互；发送为视觉态 */}
        <textarea
          className={styles.composerInput}
          placeholder={t("messagePlaceholder")}
          rows={1}
          disabled
          aria-disabled="true"
        />
        <div className={styles.composerBar}>
          {model && (
            <span className={styles.composerPill} title={t("model")}>
              <Icon name="sparkles" size={11} />
              {model}
            </span>
          )}
          {thinkingLevel && (
            <span className={styles.composerPill} title={t("thinkingLevel")}>
              {thinkingLevel}
            </span>
          )}
          {typeof toolCount === "number" && toolCount > 0 && (
            <span className={styles.composerPill} title={t("toolsUsed")}>
              {toolCount} {t("toolsSuffix")}
            </span>
          )}
          <button
            type="button"
            className={styles.sendButton}
            title={t("sendHint")}
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

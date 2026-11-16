/** Composer：会话输入区。未驱动时保持视觉态（ADR-0002 的只读边界，由驱动解锁）；
    驱动中：idle 发 prompt、running 输入转 steer（与 pi TUI 输入语义一致），可中止。 */
import { useState, type KeyboardEvent } from "react";
import type { DriveStatus } from "@pi-studio/shared/protocol";
import { Icon } from "../../ui/Icon";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import styles from "./transcript.module.css";

export interface ComposerDrive {
  status: DriveStatus;
  /** 回车发送：running 时为 steer，否则 prompt */
  onSend(text: string): void;
  /** 追问：本轮运行彻底结束后送达（pi 的 followUp） */
  onFollowUp(text: string): void;
  onAbort(): void;
}

export function Composer({
  model,
  thinkingLevel,
  toolCount,
  variant = "overlay",
  drive,
}: {
  model?: string;
  thinkingLevel?: string;
  toolCount?: number;
  /** overlay：钉在 Transcript 底部；docked：文档流内（组件总览用） */
  variant?: "overlay" | "docked";
  /** 存在即激活：会话已被驱动（GLOSSARY: Attach） */
  drive?: ComposerDrive;
}) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const running = drive?.status === "running";
  const retrying = drive?.status === "retrying";

  const submit = () => {
    const trimmed = text.trim();
    if (!drive || !trimmed) return;
    drive.onSend(trimmed);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送、Shift+Enter 换行
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={variant === "overlay" ? styles.composer : styles.composerDocked}>
      <div className={styles.composerCard}>
        <textarea
          className={styles.composerInput}
          placeholder={drive ? (running ? t("steerPlaceholder") : t("messagePlaceholder")) : t("attachHint")}
          rows={1}
          value={drive ? text : ""}
          disabled={!drive}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
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
          {drive && running && (
            <span className={styles.composerPill} title={t("runningBadge")}>
              <span className={cx(styles.statusDot, styles.statusDotRunning)} />
              {t("runningBadge")}
            </span>
          )}
          {drive && retrying && (
            <span className={styles.composerPill} title={t("retryingBadge")}>
              <span className={cx(styles.statusDot, styles.statusDotRetrying)} />
              {t("retryingBadge")}
            </span>
          )}
          {/* 运行中：回车 = steer（插话），「追问」= followUp（本轮彻底结束后送达），可中止。
              idle 下两者语义与 prompt 重合，故只保留发送，避免双入口。 */}
          {drive && running && (
            <button
              type="button"
              className={styles.followUpButton}
              title={t("followUpHint")}
              disabled={!text.trim()}
              onClick={() => {
                const trimmed = text.trim();
                if (!trimmed) return;
                drive.onFollowUp(trimmed);
                setText("");
              }}
            >
              {t("followUp")}
            </button>
          )}
          {drive && running && (
            <button type="button" className={styles.abortButton} title={t("abort")} onClick={drive.onAbort}>
              <Icon name="xmark" size={13} />
              {t("abort")}
            </button>
          )}
          <button
            type="button"
            className={styles.sendButton}
            title={drive ? t("sendHint") : t("attachHint")}
            disabled={!drive || !text.trim()}
            onClick={submit}
          >
            <Icon name="arrow-up" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

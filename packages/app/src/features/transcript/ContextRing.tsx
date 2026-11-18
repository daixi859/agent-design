/** Context Ring（GLOSSARY）：底栏右端的上下文用量环（ADR-0017）。
    SVG 圆环随用量按阈值变色（>70% 警告、>90% 危险）；hover 经 HoverCard 展开详情
    （已用 / 窗口 / 百分比 / 当前模型 / 压缩状态）。内核 usage 缺席（目录未达、
    未驱动）时整环不渲染；tokens 未知（刚压缩完）以 ? 示，不发明数字。 */
import type { ContextUsageInfo } from "@pi-studio/shared/protocol";
import { HoverCard } from "../../components/HoverCard";
import { formatTokens } from "../../lib/format";
import { translateVars } from "../../lib/i18n";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/use-locale";
import styles from "./transcript.module.css";

const RADIUS = 6.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextRing({
  usage,
  modelLabel,
  compacting,
}: {
  usage?: ContextUsageInfo;
  /** 详情面板里展示的当前模型（entries 派生优先） */
  modelLabel?: string;
  compacting?: boolean;
}) {
  const { locale, t } = useLocale();
  if (!usage) return null;
  const percent =
    usage.percent !== null ? Math.min(100, Math.max(0, Math.round(usage.percent))) : null;
  const tone =
    percent === null ? "" : percent > 90 ? styles.ringDanger : percent > 70 ? styles.ringWarning : styles.ringNormal;
  const usedText = usage.tokens !== null ? `~${formatTokens(usage.tokens)}` : "?";
  const windowText = formatTokens(usage.contextWindow);
  const percentText = percent !== null ? String(percent) : "?";

  const detail = (
    <div className={styles.ringCard}>
      <strong className={styles.ringTitle}>{translateVars(locale, "ringTitle", { percent: percentText })}</strong>
      <span className={styles.ringNumbers}>
        {usedText} / {windowText} {t("ringTokens")}
      </span>
      {modelLabel && (
        <span className={styles.ringRow}>
          {t("model")} · {modelLabel}
        </span>
      )}
      {compacting && <span className={cx(styles.ringRow, styles.ringCompacting)}>{t("compactingBadge")}</span>}
    </div>
  );

  return (
    <HoverCard content={detail} placement="top" maxWidth={240}>
      {/* 语义由详情面板承载（role=status 不适用：数值非状态变更推送）；文本可读版进 aria-label */}
      <span
        className={cx(styles.ring, tone)}
        role="img"
        aria-label={`${percentText}% · ${usedText} / ${windowText}`}
      >
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <circle className={styles.ringTrack} cx="8" cy="8" r={RADIUS} fill="none" strokeWidth="2" />
          {percent !== null && (
            <circle
              className={styles.ringValue}
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
              transform="rotate(-90 8 8)"
            />
          )}
        </svg>
      </span>
    </HoverCard>
  );
}

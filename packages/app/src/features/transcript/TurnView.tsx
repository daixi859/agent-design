/** Turn 渲染（ADR-0006 三级结构，ADR-0013 收敛为两级）。
 *
 * items 已按源顺序交替（过程组 / 回答），本文件顺序平铺即可——
 * 分组边界是模型层算好的，视图不再重新划分。
 * 折叠收敛为一级：每个过程组一条 Recap（N tools · M thoughts），展开即 Process Strip。
 * 生成中的那一轮强制展开：工具在跑却被折叠，看着就像卡住。
 */
import { useEffect, useState } from "react";
import { Icon } from "../../ui/Icon";
import { cx } from "../../lib/cx";
import { translateVars, type MessageKey } from "../../lib/i18n";
import { useLocale } from "../../state/useLocale";
import type { GroupItem, GroupRecap, Turn, TurnItem } from "../../lib/transcript-model";
import { Markdown } from "./Markdown";
import { AnnotationRow } from "./AnnotationRow";
import { ToolRow } from "./ToolRow";
import { UserMessageView } from "./MessageViews";
import styles from "./transcript.module.css";

function plural(n: number, one: MessageKey, many: MessageKey, t: (k: MessageKey) => string) {
  return `${n} ${t(n === 1 ? one : many)}`;
}

/** 耗时：不足一秒报毫秒，否则报秒（数字走 locale，不手拼） */
function formatDuration(ms: number, locale: string): string {
  if (ms < 1000) return `${ms}ms`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)}s`;
}

/** tokens：紧凑记数（1.2K / 3.4M），不手拼单位 */
function formatTokens(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 思考行：tertiary 灰、无斜体、无左边框（DSH）；正文与标题左缘对齐 */
function ThinkingRow({ item, defaultOpen = false }: { item: Extract<GroupItem, { kind: "thinking" }>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useLocale();
  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.rowLead}>
          <span className={styles.rowIcon}>
            <Icon name="sparkles" size={14} />
          </span>
          <span className={styles.rowChevron} data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
        </span>
        <span className={styles.rowTitle}>
          {item.redacted ? t("encryptedReasoning") : t("thinking")}
        </span>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.rowSummary}>{item.thinking.split("\n")[0]}</span>
      </button>
      {open && <div className={cx(styles.rowBody, styles.thinkingBody)}>{item.thinking}</div>}
    </div>
  );
}

/**
 * 过程组：Recap + Process Strip（ADR-0013 的一级折叠）。
 * 被弃分支只标注一次——由调用方决定标在哪个组上，避免每条都重复。
 */
function ProcessGroup({
  group,
  recap,
  settlement,
  abandoned,
  draft = false,
  live = false,
}: {
  group: GroupItem[];
  recap: GroupRecap;
  /** 本轮耗时与 tokens（Recap 只报有值的量） */
  settlement: { durationMs?: number; tokens?: number };
  abandoned: number;
  /** 本轮仍挂在流式草稿上：Recap 用文字标注，不加状态色 */
  draft?: boolean;
  live?: boolean;
}) {
  const [open, setOpen] = useState(live);
  const { t, locale } = useLocale();
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  const { tools, thoughts, failed } = recap;

  return (
    <div className={styles.groupWrap}>
      <div className={styles.recapRow}>
        <button
          type="button"
          className={styles.recap}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.recapLead}>
            <span className={styles.recapChevron} data-open={open}>
              <Icon name="chevron-right" size={12} />
            </span>
          </span>
          {draft && <span className={styles.recapDraft}>{t("draft")}</span>}
          {tools > 0 && plural(tools, "toolCount", "toolCountPlural", t)}
          {tools > 0 && thoughts > 0 && <span className={styles.dot} aria-hidden="true" />}
          {thoughts > 0 && plural(thoughts, "thoughtCount", "thoughtCountPlural", t)}
          {failed > 0 && (
            <span className={styles.recapFacts}>
              · {plural(failed, "failedCount", "failedCountPlural", t)}
            </span>
          )}
          {settlement.durationMs !== undefined && (
            <span className={styles.recapFacts}>· {formatDuration(settlement.durationMs, locale)}</span>
          )}
          {settlement.tokens !== undefined && (
            <span className={styles.recapFacts}>· {formatTokens(settlement.tokens, locale)}</span>
          )}
          {abandoned > 0 && (
            <span className={styles.recapFacts}>
              ·{" "}
              {translateVars(
                locale,
                abandoned === 1 ? "abandonedBranch" : "abandonedBranchPlural",
                { n: String(abandoned) },
              )}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className={styles.strip}>
          {group.map((item) =>
            item.kind === "thinking" ? (
              <ThinkingRow key={item.id} item={item} defaultOpen={live} />
            ) : (
              <ToolRow key={item.id} item={item} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TurnItemView({
  item,
  settlement,
  draft,
  abandoned,
  live,
}: {
  item: TurnItem;
  /** 本轮结算事实；只交给一个过程组（与被弃分支同一投递点），避免每条 Recap 重复同一个数 */
  settlement: { durationMs?: number; tokens?: number };
  /** 本轮仍是流式草稿（末条 assistant 尚未定稿） */
  draft: boolean;
  abandoned: number;
  live: boolean;
}) {
  const { t } = useLocale();

  switch (item.kind) {
    case "text":
      return <Markdown>{item.text}</Markdown>;
    case "quiet":
      return <p className={styles.quietText}>{item.text}</p>;
    case "annotation":
      return <AnnotationRow entry={item.entry} />;
    case "warning":
      // assistant 页脚整体退役（ADR-0006），只保留中止与错误两行警示
      return item.note === "aborted" ? (
        <p className={cx(styles.warning, styles.warningAborted)}>
          <Icon name="pause" size={13} />
          {t("aborted")}
        </p>
      ) : (
        <p className={cx(styles.warning, styles.warningError)}>
          <Icon name="warning" size={13} />
          {item.message ?? t("errorOccurred")}
        </p>
      );
    case "group":
      return (
        <ProcessGroup
          group={item.group}
          recap={item.recap}
          settlement={settlement}
          abandoned={abandoned}
          draft={draft}
          live={live}
        />
      );
  }
}

export function TurnView({ turn, live = false }: { turn: Turn; live?: boolean }) {
  // 被弃分支只标在首个过程组上，避免每条 Recap 都重复同一个数
  const firstGroupId = turn.items.find((item) => item.kind === "group")?.id;
  // Draft 标记只挂在最后一个过程组上（与「只标一次」的收敛一致）
  const lastGroupId = [...turn.items].reverse().find((item) => item.kind === "group")?.id;
  const abandoned = turn.abandonedCount ?? 0;

  return (
    <div className={styles.turn}>
      {turn.user && <UserMessageView entry={turn.user} />}
      {turn.items.map((item) => (
        <TurnItemView
          key={item.id}
          item={item}
          settlement={
            item.kind === "group" && item.id === firstGroupId
              ? { durationMs: turn.durationMs, tokens: turn.tokens }
              : {}
          }
          draft={Boolean(turn.draft && item.kind === "group" && item.id === lastGroupId)}
          abandoned={item.kind === "group" && item.id === firstGroupId ? abandoned : 0}
          live={live}
        />
      ))}
    </div>
  );
}

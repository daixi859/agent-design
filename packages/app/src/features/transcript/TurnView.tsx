/** Turn 渲染（ADR-0006 三级结构，ADR-0013 收敛为两级）。
 *
 * items 已按源顺序交替（过程组 / 回答），本文件顺序平铺即可——
 * 分组边界是模型层算好的，视图不再重新划分。
 * 折叠收敛为一级：每个过程组一条 Recap（N tools · M thoughts），展开即 Process Strip。
 * 生成中的那一轮强制展开：工具在跑却被折叠，看着就像卡住。
 */
import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { DisclosureRow } from "../../components/DisclosureRow";
import { cx } from "../../lib/cx";
import { translateVars, type MessageKey } from "../../lib/i18n";
import { formatDuration } from "../../lib/format";
import { useLocale } from "../../state/useLocale";
import { useViewMode } from "../../state/useViewMode";
import type { GroupItem, GroupRecap, Turn, TurnItem } from "../../lib/transcript-model";
import { Markdown } from "./Markdown";
import { AnnotationRow } from "./AnnotationRow";
import { ToolRow } from "./ToolRow";
import { TuiGroup, TuiTurnSummary } from "./TuiGroup";
import { UserMessageView } from "./MessageViews";
import styles from "./transcript.module.css";

function plural(n: number, one: MessageKey, many: MessageKey, t: (k: MessageKey) => string) {
  return `${n} ${t(n === 1 ? one : many)}`;
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
      <DisclosureRow
        className={styles.rowHead}
        open={open}
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
      </DisclosureRow>
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
        <DisclosureRow
          className={styles.recap}
          open={open}
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
        </DisclosureRow>
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
  isLastGroup = false,
  isTurnTail = false,
  detachGroupId,
}: {
  item: TurnItem;
  /** 本轮耗时与 tokens（Recap 只报有值的量） */
  settlement: { durationMs?: number; tokens?: number };
  /** 本轮仍是流式草稿（末条 assistant 尚未定稿） */
  draft: boolean;
  abandoned: number;
  live: boolean;
  /** 是否本轮最后一个过程组：TUI 运行态的 turn 级 live 只亮给它（前面的组已结算） */
  isLastGroup?: boolean;
  /** 是否 turn 的当前尾部（ADR-0014）：组被正文 flush 终结后不再是尾部，
      组内思考即便排在组内末位也已完成——活跃权以此为准 */
  isTurnTail?: boolean;
  /** TUI 贴底抽取（ADR-0014 迭代）：命中的组不在此渲染，由 Transcript 在滚动区末尾挂出 */
  detachGroupId?: string;
}) {
  const { t } = useLocale();
  // 渲染模式（ADR-0014）：TUI 只接管 Process Group 区，正文四类 TurnItem 两种模式同渲染
  const [mode] = useViewMode();

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
      if (item.id === detachGroupId) return null;
      return mode === "tui" ? (
        <TuiGroup
          group={item.group}
          recap={item.recap}
          drafting={draft}
          live={live && isLastGroup}
          isTurnTail={isTurnTail}
        />
      ) : (
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

export function TurnView({
  turn,
  live = false,
  detachGroupId,
}: {
  turn: Turn;
  live?: boolean;
  /** TUI 贴底抽取（ADR-0014 迭代）：命中的组不在此渲染，由 Transcript 在滚动区末尾挂出 */
  detachGroupId?: string;
}) {
  // 被弃分支只标在首个过程组上，避免每条 Recap 都重复同一个数
  const firstGroupId = turn.items.find((item) => item.kind === "group")?.id;
  // Draft 标记只挂在最后一个过程组上（与「只标一次」的收敛一致）
  const lastGroupId = [...turn.items].reverse().find((item) => item.kind === "group")?.id;
  const abandoned = turn.abandonedCount ?? 0;
  // 渲染模式（ADR-0014）：汇总行与明细行显隐是 TUI 结算 turn 的专属结构
  const [mode] = useViewMode();
  /** 结算 turn 的明细展开态（迭代反馈）：收起 = 只留各段回答正文，展开 = 加上各组明细行 */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tuiSettled =
    mode === "tui" && !live && ((turn.toolsTotal ?? 0) > 0 || (turn.thoughtsTotal ?? 0) > 0);

  return (
    <div className={styles.turn}>
      {turn.user && <UserMessageView entry={turn.user} />}
      {tuiSettled && (
        <TuiTurnSummary
          count={turn.toolsTotal ?? 0}
          thoughts={turn.thoughtsTotal ?? 0}
          durationMs={turn.durationMs}
          endAt={turn.endAt}
          open={detailsOpen}
          onToggle={() => setDetailsOpen((v) => !v)}
        />
      )}
      {turn.items.map((item) => {
        // TUI 结算 turn 收起态：过程组明细行隐藏（汇总行已表达结论量），正文照常
        if (tuiSettled && !detailsOpen && item.kind === "group") return null;
        return (
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
            isLastGroup={item.kind === "group" && item.id === lastGroupId}
            isTurnTail={item.id === turn.items[turn.items.length - 1]?.id}
            detachGroupId={detachGroupId}
          />
        );
      })}
    </div>
  );
}

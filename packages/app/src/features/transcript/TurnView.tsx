/** Turn 渲染（ADR-0006 三层）：轮聚合条 → Tool Group 条 → 单条目；回答平铺。
    消费的 GroupItem 已是模型层归一化的显示形状，本文件零伪造。 */
import { Fragment, useState } from "react";
import type { GroupItem, Turn, TurnItem } from "../../lib/transcript-model";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import { Markdown } from "./Markdown";
import { AnnotationRow } from "./AnnotationRow";
import { ThinkingSection } from "./ThinkingSection";
import { ToolCallCard } from "./ToolCallCard";
import { UserMessageView } from "./MessageViews";
import styles from "./transcript.module.css";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function stepsLabel(stepCount: number, thoughtCount: number): string {
  const parts = [plural(stepCount, "step")];
  if (thoughtCount > 0) parts.push(plural(thoughtCount, "thought"));
  return parts.join(" · ");
}

/** 层 2：分组条（默认折叠）+ 层 3 单条目 */
function GroupSection({ group }: { group: GroupItem[] }) {
  const [open, setOpen] = useState(false);
  const toolCount = group.filter((item) => item.kind === "toolCall").length;
  const thoughtCount = group.filter((item) => item.kind === "thinking").length;

  return (
    <div className={styles.groupWrap}>
      <button
        type="button"
        className={styles.groupBar}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={styles.groupChevron} data-open={open}>
          <Icon name="chevron-right" size={11} />
        </span>
        {plural(toolCount, "tool")}
        {thoughtCount > 0 ? ` · ${plural(thoughtCount, "thought")}` : ""}
      </button>
      {open && (
        <div className={styles.groupItems}>
          {group.map((item) => {
            switch (item.kind) {
              case "thinking":
                return (
                  <ThinkingSection
                    key={item.id}
                    thinking={item.thinking}
                    redacted={item.redacted}
                  />
                );
              case "toolCall":
                return <ToolCallCard key={item.id} item={item} />;
            }
          })}
        </div>
      )}
    </div>
  );
}

function TurnItemView({
  item,
  isFirstGroup,
  open,
  onToggleOpen,
  stepCount,
  thoughtCount,
}: {
  item: TurnItem;
  isFirstGroup: boolean;
  open: boolean;
  onToggleOpen: () => void;
  stepCount: number;
  thoughtCount: number;
}) {
  switch (item.kind) {
    case "text":
      return (
        <div className={styles.answerBlock}>
          <Markdown>{item.text}</Markdown>
        </div>
      );
    case "quiet":
      return (
        <div className={styles.answerBlock}>
          <span className={styles.quietText}>{item.text}</span>
        </div>
      );
    case "annotation":
      return <AnnotationRow entry={item.entry} />;
    case "warning":
      return item.note === "aborted" ? (
        <p className={cx(styles.warningNote, styles.warningAborted)}>Aborted</p>
      ) : (
        <p className={cx(styles.warningNote, styles.warningError)}>
          {item.message ?? "An error occurred"}
        </p>
      );
    case "group": {
      // 折叠时整轮只显示首条聚合条；展开后各分组条回到原位
      if (!open) {
        return isFirstGroup ? (
          <button type="button" className={styles.stepsBar} onClick={onToggleOpen}>
            <Icon name="chevron-right" size={12} />
            {stepsLabel(stepCount, thoughtCount)}
          </button>
        ) : null;
      }
      return (
        <Fragment key={item.id}>
          {isFirstGroup && (
            <button
              type="button"
              className={styles.stepsBar}
              onClick={onToggleOpen}
              aria-expanded="true"
            >
              <Icon name="chevron-down" size={12} />
              {stepsLabel(stepCount, thoughtCount)}
            </button>
          )}
          <GroupSection group={item.group} />
        </Fragment>
      );
    }
  }
}

export function TurnView({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const groups = turn.items.filter((item): item is Extract<TurnItem, { kind: "group" }> => item.kind === "group");
  const stepCount = groups.reduce((count, g) => count + g.group.length, 0);
  const thoughtCount = groups.reduce(
    (count, g) => count + g.group.filter((item) => item.kind === "thinking").length,
    0,
  );
  const firstGroupId = groups[0]?.id;

  return (
    <div className={styles.turn}>
      {turn.user && <UserMessageView entry={turn.user} />}
      {turn.items.map((item) => (
        <TurnItemView
          key={item.kind === "group" && !open && item.id !== firstGroupId ? `${item.id}-hidden` : item.id}
          item={item}
          isFirstGroup={item.kind === "group" && item.id === firstGroupId}
          open={open}
          onToggleOpen={() => setOpen((value) => !value)}
          stepCount={stepCount}
          thoughtCount={thoughtCount}
        />
      ))}
    </div>
  );
}

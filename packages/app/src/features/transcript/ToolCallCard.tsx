/** 工具调用卡：TranscriptModel 归一化后的显示条目（ToolCallItem）折叠呈现。
    本 module 只做呈现——icon 映射、摘要截断、展开交互；提取规则在模型层。 */
import { useState } from "react";
import { Icon, type IconName } from "../../ui/Icon";
import { DiffView } from "./DiffView";
import styles from "./transcript.module.css";
import { cx } from "../../lib/cx";
import type { ToolCallItem } from "../../lib/transcript-model";

const TOOL_ICONS: Record<string, IconName> = {
  bash: "terminal",
  powershell: "terminal",
  edit: "pencil",
  write: "doc",
  read: "doc",
  grep: "search",
  find: "search",
  ls: "folder",
};

function toolIcon(name: string): IconName {
  return TOOL_ICONS[name] ?? "wrench";
}

/** 头部摘要：空白折叠 + 80 字符截断（卡片宽度的呈现约束） */
function truncateSummary(summary: string | undefined): string {
  return (summary ?? "").replace(/\s+/g, " ").slice(0, 80);
}

export function ToolCallCard({ item }: { item: ToolCallItem }) {
  const [open, setOpen] = useState(item.isError);

  return (
    <div className={styles.toolCard} data-error={item.isError}>
      <button
        type="button"
        className={styles.toolHeader}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Icon name={toolIcon(item.name)} size={14} />
        <span className={styles.toolName}>{item.name}</span>
        <span className={cx("ellipsis", styles.toolSummary)}>
          {truncateSummary(item.summary)}
        </span>
        {item.isError && <Icon name="warning" size={13} className={styles.toolErrorIcon} />}
        <span className={styles.toolChevron} data-open={open}>
          <Icon name="chevron-right" size={12} />
        </span>
      </button>

      {open && (
        <div className={styles.toolBody}>
          {item.args && (
            <pre className={styles.toolArgs}>{JSON.stringify(item.args, null, 2)}</pre>
          )}
          {item.diff && <DiffView diff={item.diff} />}
          {item.output && (
            <pre className={styles.toolOutput} data-error={item.isError}>
              {item.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

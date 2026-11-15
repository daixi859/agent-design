/** 工具调用卡：call + 配对 result 合并渲染（Q14 消息级） */
import { useState } from "react";
import type {
  ContentBlock,
  ToolCallBlock,
  ToolResultMessage,
} from "../../../shared/pi-types";
import { Icon, type IconName } from "../../ui/Icon";
import { DiffView } from "./DiffView";
import styles from "./transcript.module.css";
import { cx } from "../../lib/cx";

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

function argSummary(args?: Record<string, unknown>): string {
  if (!args) return "";
  const value =
    (args.path as string) ??
    (args.command as string) ??
    (args.pattern as string) ??
    (args.glob as string) ??
    Object.values(args).find((v) => typeof v === "string");
  const text = typeof value === "string" ? value : JSON.stringify(args);
  return text.replace(/\s+/g, " ").slice(0, 80);
}

function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function detailDiff(details: unknown): string | undefined {
  if (details && typeof details === "object" && "diff" in details) {
    const diff = (details as { diff?: unknown }).diff;
    if (typeof diff === "string" && diff) return diff;
  }
  return undefined;
}

export function ToolCallCard({
  call,
  result,
}: {
  call: ToolCallBlock;
  /** 同分支上按 toolCallId 配对的 toolResult（可能缺失：中断等） */
  result?: ToolResultMessage;
}) {
  const isError = result?.isError ?? false;
  const [open, setOpen] = useState(isError);
  const args = call.arguments;
  const diff = detailDiff(result?.details);
  const output = result ? blocksToText(result.content) : undefined;

  return (
    <div className={styles.toolCard} data-error={isError}>
      <button
        type="button"
        className={styles.toolHeader}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Icon name={toolIcon(call.name)} size={14} />
        <span className={styles.toolName}>{call.name}</span>
        <span className={cx("ellipsis", styles.toolSummary)}>
          {argSummary(args)}
        </span>
        {isError && <Icon name="warning" size={13} className={styles.toolErrorIcon} />}
        <span className={styles.toolChevron} data-open={open}>
          <Icon name="chevron-right" size={12} />
        </span>
      </button>

      {open && (
        <div className={styles.toolBody}>
          {args && Object.keys(args).length > 0 && (
            <pre className={styles.toolArgs}>{JSON.stringify(args, null, 2)}</pre>
          )}
          {diff && <DiffView diff={diff} />}
          {output && (
            <pre className={styles.toolOutput} data-error={isError}>
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

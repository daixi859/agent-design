/** 注解级条目（ADR-0006 收缩后：compaction / branch_summary / 首次 session_info） */
import type {
  BranchSummaryEntry,
  CompactionEntry,
  SessionEntry,
  SessionInfoEntry,
} from "../../../shared/pi-types";
import { formatTokens } from "../../lib/format";
import { Icon, type IconName } from "../../ui/Icon";
import styles from "./transcript.module.css";

function annotationFor(entry: SessionEntry): { icon: IconName; text: string } | undefined {
  switch (entry.type) {
    case "session_info": {
      const { name } = entry as SessionInfoEntry;
      return { icon: "doc", text: `Session named “${name}”` };
    }
    case "branch_summary": {
      const { summary } = entry as BranchSummaryEntry;
      return { icon: "branch", text: summary ?? "Earlier branch summarized" };
    }
    case "compaction": {
      const { tokensBefore } = entry as CompactionEntry;
      return {
        icon: "sparkles",
        text: `Context compacted${tokensBefore ? ` · ${formatTokens(tokensBefore)} tokens before` : ""}`,
      };
    }
    default:
      return undefined;
  }
}

export function AnnotationRow({ entry }: { entry: SessionEntry }) {
  const annotation = annotationFor(entry);
  if (!annotation) return null;
  return (
    <div className={styles.annotation}>
      <Icon name={annotation.icon} size={11} />
      <span>{annotation.text}</span>
    </div>
  );
}

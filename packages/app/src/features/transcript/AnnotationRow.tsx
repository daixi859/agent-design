/** 注解级条目（ADR-0006 收缩后：compaction / branch_summary / 首次 session_info /
    display:true 的 custom_message） */
import type {
  BranchSummaryEntry,
  CompactionEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionInfoEntry,
} from "@pi-studio/shared/pi-types";
import { contentText } from "@pi-studio/shared/message-text";
import { formatTokens } from "../../lib/format";
import { translate, translateVars, type Locale } from "../../lib/i18n";
import { useLocale } from "../../state/useLocale";
import { Icon, type IconName } from "../../ui/Icon";
import styles from "./transcript.module.css";

function annotationFor(entry: SessionEntry, locale: Locale): { icon: IconName; text: string } | undefined {
  switch (entry.type) {
    case "session_info": {
      const { name } = entry as SessionInfoEntry;
      // 类型层 name 可选（上游清名）；模型层已跳过空名条目，此处空串兜底仅防御
      return { icon: "doc", text: translateVars(locale, "sessionNamed", { name: name ?? "" }) };
    }
    case "branch_summary": {
      const { summary } = entry as BranchSummaryEntry;
      return { icon: "branch", text: summary ?? translate(locale, "earlierBranch") };
    }
    case "compaction": {
      const { tokensBefore } = entry as CompactionEntry;
      return {
        icon: "sparkles",
        text:
          translate(locale, "contextCompacted") +
          (tokensBefore
            ? ` · ${translateVars(locale, "tokensBefore", { n: formatTokens(tokensBefore) })}`
            : ""),
      };
    }
    case "custom_message": {
      // 扩展注入的用户可见消息：customType 是扩展的机器名（数据，不走 i18n），
      // 正文抽全部 text 块拼接；纯图片等无文本时只留类型标签
      const { customType, content } = entry as CustomMessageEntry;
      const body = contentText(content).trim();
      return {
        icon: "doc",
        text: `${translateVars(locale, "extensionMessage", { customType })}${body ? ` — ${body}` : ""}`,
      };
    }
    default:
      return undefined;
  }
}

export function AnnotationRow({ entry }: { entry: SessionEntry }) {
  const { locale } = useLocale();
  const annotation = annotationFor(entry, locale);
  if (!annotation) return null;
  return (
    <div className={styles.annotation}>
      <Icon name={annotation.icon} size={11} />
      <span>{annotation.text}</span>
    </div>
  );
}

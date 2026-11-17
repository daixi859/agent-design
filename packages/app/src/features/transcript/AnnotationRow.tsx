/** 注解级条目（ADR-0006 收缩后：compaction / branch_summary / 首次 session_info）；
    custom_message（上下文注入）与 system message（系统提示词）呈现为可展开行
    （ADR-0004 修订二/三：模型层走注解通道，视图按条目类型分流） */
import { useState } from "react";
import type {
  BranchSummaryEntry,
  CompactionEntry,
  CustomMessageEntry,
  MessageEntry,
  SessionEntry,
  SessionInfoEntry,
} from "@pi-studio/shared/pi-types";
import { contentText } from "@pi-studio/shared/message-text";
import { formatTokens } from "../../lib/format";
import { translate, translateVars, type Locale } from "../../lib/i18n";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import { Icon, type IconName } from "../../ui/Icon";
import { DisclosureRow } from "../../ui/DisclosureRow";
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
    default:
      return undefined;
  }
}

/** 上下文注入行（GLOSSARY「Context Injection」）：扩展经内核 sendMessage /
    boundary draft 写入的 custom_message 条目，content 参与 LLM 上下文、details
    是扩展私有元数据（不上送模型）。行头同工具行形态——图标 +「上下文注入」标题 +
    customType 摘要（机器名，数据不走 i18n）；展开体为正文与元数据两块代码面
    （ADR-0007 统一表面，不加头部栏）。display:false 在模型层已隐藏，走不到这里。 */
function InjectionRow({ entry }: { entry: CustomMessageEntry }) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  // 正文抽全部 text 块；纯图片等无文本且无元数据时退化为静态行（无处可展开）
  const body = contentText(entry.content).trim();
  const hasDetails = entry.details !== undefined && entry.details !== null;
  const expandable = Boolean(body) || hasDetails;

  const head = (
    <>
      <span className={styles.rowLead}>
        <span className={styles.rowIcon}>
          <Icon name="arrow-down-to-line" size={14} />
        </span>
        {expandable && (
          <span className={styles.rowChevron} data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
        )}
      </span>
      <span className={styles.rowTitle}>{t("contextInjection")}</span>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.rowSummary}>{entry.customType}</span>
    </>
  );

  return (
    <div className={cx(styles.row, styles.turnRow)}>
      {expandable ? (
        <DisclosureRow
          className={styles.rowHead}
          open={open}
          onClick={() => setOpen((value) => !value)}
        >
          {head}
        </DisclosureRow>
      ) : (
        <div className={cx(styles.rowHead, styles.rowStatic)}>{head}</div>
      )}
      {expandable && open && (
        <div className={styles.rowBody}>
          {body && <pre className={styles.codeBody}>{body}</pre>}
          {hasDetails && (
            <>
              <span className={styles.rowTag}>{t("injectionDetails")}</span>
              <pre className={styles.codeBody}>{JSON.stringify(entry.details, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 系统提示词行（GLOSSARY「System Prompt」，ADR-0004 修订三）：内核每轮对
    sections 做 diff、有变化才落盘的 system 条目——content 为空串，全文在
    message.sections（project_context 段即 AGENTS.md 等项目说明的渲染）。
    行头同注入行形态——齿轮图标 +「系统提示词」标题 + 段数摘要；展开逐段呈现，
    段名是内核 section key（机器名，不走 i18n）。 */
function SystemPromptRow({ entry }: { entry: MessageEntry }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useLocale();
  const sections = (entry.message as { sections?: Record<string, string> }).sections ?? {};
  const keys = Object.keys(sections);
  const summary =
    translateVars(locale, "systemPromptSections", { n: String(keys.length) }) +
    (sections.project_context !== undefined ? ` · ${t("systemPromptProjectContext")}` : "");

  return (
    <div className={cx(styles.row, styles.turnRow)}>
      <DisclosureRow
        className={styles.rowHead}
        open={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.rowLead}>
          <span className={styles.rowIcon}>
            <Icon name="gear" size={14} />
          </span>
          <span className={styles.rowChevron} data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
        </span>
        <span className={styles.rowTitle}>{t("systemPromptEntry")}</span>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.rowSummary}>{summary}</span>
      </DisclosureRow>
      {open && (
        <div className={styles.rowBody}>
          {keys.map((key) => (
            <div key={key} className={styles.sectionGroup}>
              <span className={styles.rowTag}>{key}</span>
              <pre className={styles.codeBody}>{sections[key]}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnnotationRow({ entry }: { entry: SessionEntry }) {
  const { locale } = useLocale();
  // 上下文注入与系统提示词升级为可展开行；其余注解保持细分隔线 + 灰色小字
  if (entry.type === "custom_message") return <InjectionRow entry={entry as CustomMessageEntry} />;
  if (entry.type === "message" && (entry as MessageEntry).message.role === "system")
    return <SystemPromptRow entry={entry as MessageEntry} />;
  const annotation = annotationFor(entry, locale);
  if (!annotation) return null;
  return (
    <div className={styles.annotation}>
      <Icon name={annotation.icon} size={11} />
      <span>{annotation.text}</span>
    </div>
  );
}

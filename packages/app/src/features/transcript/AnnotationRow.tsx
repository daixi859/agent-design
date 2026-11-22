/** 注解级条目呈现（ADR-0006 收缩后：compaction / branch_summary / session_info /
    Context Injection / System Prompt）。分类与显示数据由模型层归一（C5：
    AnnotationDisplay，Entry 树不出接口），本文件只做「哪类注解 → 图标与文案」的
    呈现映射——不再持 wire 类型的 switch / 强转 / sections 手解析。 */
import { useState } from "react";
import { formatTokens } from "../../lib/format";
import { translate, translateVars, type Locale } from "../../lib/i18n";
import { useLocale } from "../../state/use-locale";
import { cx } from "../../lib/cx";
import { Icon, type IconName } from "../../components/Icon";
import { DisclosureRow } from "../../components/DisclosureRow";
import type { AnnotationDisplay } from "../../lib/transcript-model";
import styles from "./transcript.module.css";

/** 细分隔线注解（三类）的呈现映射：图标 + 文案（locale 相关，模型层不持文案） */
function annotationPresent(
  display: AnnotationDisplay,
  locale: Locale,
): { icon: IconName; text: string } | undefined {
  switch (display.kind) {
    case "sessionInfo":
      return { icon: "doc", text: translateVars(locale, "sessionNamed", { name: display.name }) };
    case "branchSummary":
      return { icon: "branch", text: display.summary ?? translate(locale, "earlierBranch") };
    case "compaction":
      return {
        icon: "sparkles",
        text:
          translate(locale, "contextCompacted") +
          (display.tokensBefore !== undefined
            ? ` · ${translateVars(locale, "tokensBefore", { n: formatTokens(display.tokensBefore, locale) })}`
            : ""),
      };
    default:
      return undefined;
  }
}

/** 上下文注入行（GLOSSARY「Context Injection」）：content 参与 LLM 上下文、details
    是扩展私有元数据（不上送模型）——归一体已带 body 与 details。行头同工具行形态——
    图标 +「上下文注入」标题 + customType 摘要（机器名，数据不走 i18n）；展开体为
    正文与元数据两块代码面（ADR-0007 统一表面，不加头部栏）。display:false 在模型层
    已隐藏，走不到这里。 */
function InjectionRow({ display }: { display: Extract<AnnotationDisplay, { kind: "injection" }> }) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  const body = display.body;
  const hasDetails = display.details !== undefined;
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
      <span className={cx("ellipsis", styles.rowSummary)}>{display.customType}</span>
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
              <pre className={styles.codeBody}>{JSON.stringify(display.details, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 系统提示词行（GLOSSARY「System Prompt」，ADR-0004 修订三）：sections 由模型层
    归一带出。行头同注入行形态——齿轮图标 +「系统提示词」标题 + 段数摘要；展开逐段
    呈现，段名是内核 section key（机器名，不走 i18n）。 */
function SystemPromptRow({ sections }: { sections: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { t, locale } = useLocale();
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
        <span className={cx("ellipsis", styles.rowSummary)}>{summary}</span>
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

export function AnnotationRow({ display }: { display: AnnotationDisplay }) {
  const { locale } = useLocale();
  if (display.kind === "injection") return <InjectionRow display={display} />;
  if (display.kind === "systemPrompt") return <SystemPromptRow sections={display.sections} />;
  const annotation = annotationPresent(display, locale);
  if (!annotation) return null;
  return (
    <div className={styles.annotation}>
      <Icon name={annotation.icon} size={11} />
      <span>{annotation.text}</span>
    </div>
  );
}

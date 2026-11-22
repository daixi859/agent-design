/** Markdown 渲染（Q18：react-markdown + remark-gfm + Shiki 常暗高亮，ADR-0005） */
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeToHtml } from "shiki";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/use-locale";
import styles from "./transcript.module.css";

/** 折叠预览的最大高度（与 transcript.module.css 的 max-block-size 保持一致） */
const CODE_PREVIEW_MAX = 210;

/** 复制成功的确认时长（DSH useClipboardCopy：1000ms） */
const COPIED_MS = 1000;

function CodeBlock({
  code,
  lang,
  copyLabel,
  copyCopied,
}: {
  code: string;
  lang: string;
  /** 复制文案由调用方注入（DSH CodeBlock 同样不内置文案），默认英文兜底 */
  copyLabel?: string;
  copyCopied?: string;
}) {
  const [html, setHtml] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const copyLabelText = copyLabel ?? "Copy";
  const copyCopiedText = copyCopied ?? "Copied";

  useEffect(() => {
    let cancelled = false;
    // Shiki 异步双主题高亮（ADR-0007：代码面随主题）；失败时保留纯文本 fallback
    codeToHtml(code, {
      lang: lang || "text",
      themes: { light: "one-light", dark: "github-dark" },
    })
      .then((value) => {
        if (!cancelled) setHtml(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  // 仅当内容真的超出预览高度时才提供折叠按钮
  useEffect(() => {
    const pre = wrapRef.current?.querySelector("pre");
    setOverflowing((pre?.scrollHeight ?? 0) > CODE_PREVIEW_MAX + 8);
  }, [html, code]);

  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => {
        // 剪贴板不可用时静默
      });
  };

  // 结构照 DSH CodeBlock：sticky 的 bannerWrap 包住 banner，正文进 content
  // （content 是 display:contents，圆角与底色落在 <pre> 上，sticky 才不被裁掉）
  return (
    <div ref={wrapRef} className={cx(styles.codeShell, expanded && styles.codeExpanded)}>
      <div className={styles.codeBannerWrap}>
        <div className={styles.codeBanner}>
          <span className={cx("ellipsis", styles.codeLang)}>{lang || "code"}</span>
          <button type="button" className={styles.codeAction} onClick={copy}>
            {copied ? copyCopiedText : copyLabelText}
          </button>
        </div>
      </div>
      <div className={styles.codeContent}>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className={styles.codeFallback}>
            <code>{code}</code>
          </pre>
        )}
      </div>
      {!expanded && overflowing && (
        <button type="button" className={styles.codeExpand} onClick={() => setExpanded(true)}>
          Show code
        </button>
      )}
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  const { t } = useLocale();
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 块级代码在此接管（pre > code），行内 code 走 inlineCode 样式
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
              const className = child.props.className ?? "";
              const lang = /language-([\w-]+)/.exec(className)?.[1] ?? "";
              const code = String(child.props.children ?? "").replace(/\n$/, "");
              return (
                <CodeBlock
                  code={code}
                  lang={lang}
                  copyLabel={t("copy")}
                  copyCopied={t("copied")}
                />
              );
            }
            return <pre className={styles.codeFallback}>{children}</pre>;
          },
          code: ({ children }) => (
            <code className={styles.inlineCode}>{children}</code>
          ),
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

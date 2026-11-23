import { cn } from "../../lib/cn";

/** ZCode 的 lightweight diff 预览行样式（复制 getLightweightDiffLineStyles 的行内样式约定）。 */
export type LightweightDiffLineKind = "added" | "removed" | "context";

export interface LightweightDiffLineParts {
  content: string;
  kind: LightweightDiffLineKind;
  marker: string;
  raw: string;
}

export function getLightweightDiffLineParts(line: string): LightweightDiffLineParts {
  if (line.startsWith("+")) {
    return { content: line.slice(1), kind: "added", marker: "+", raw: line };
  }

  if (line.startsWith("-")) {
    return { content: line.slice(1), kind: "removed", marker: "-", raw: line };
  }

  return { content: line.replace(/^ /, ""), kind: "context", marker: "", raw: line };
}

type LightweightDiffLineStyles = {
  gutterStyle?: React.CSSProperties;
  lineNumberClassName: string;
  rowStyle?: React.CSSProperties;
};

function getLightweightDiffLineStyles(kind: LightweightDiffLineKind): LightweightDiffLineStyles {
  if (kind === "added") {
    return {
      lineNumberClassName: "text-diff-added",
      rowStyle: {
        backgroundColor: "color-mix(in srgb, var(--color-diff-added) 14%, transparent)",
        boxShadow: "inset 3px 0 0 var(--color-diff-added)",
      },
      gutterStyle: {
        backgroundColor: "color-mix(in srgb, var(--color-diff-added) 18%, var(--color-background))",
        boxShadow: "inset 3px 0 0 var(--color-diff-added)",
        color: "var(--color-diff-added)",
      },
    };
  }

  if (kind === "removed") {
    return {
      lineNumberClassName: "text-diff-removed",
      rowStyle: {
        backgroundColor: "color-mix(in srgb, var(--color-diff-removed) 14%, transparent)",
        boxShadow: "inset 3px 0 0 var(--color-diff-removed)",
      },
      gutterStyle: {
        backgroundColor:
          "color-mix(in srgb, var(--color-diff-removed) 18%, var(--color-background))",
        boxShadow: "inset 3px 0 0 var(--color-diff-removed)",
        color: "var(--color-diff-removed)",
      },
    };
  }

  return {
    lineNumberClassName: "text-foreground-subtlest",
    gutterStyle: {
      backgroundColor: "var(--color-background)",
    },
  };
}

export type LightweightDiffPreviewProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  lines: readonly string[];
  fontSizePx?: number;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
};

/**
 * 轻量 diff 预览（ZCode lightweight-diff-preview.tsx 的样式复刻）：
 * 只用行背景、状态条和行号颜色表达增删，不显示 +/- marker。
 */
export function LightweightDiffPreview({
  className,
  lines,
  fontSizePx = 12,
  showLineNumbers = true,
  wrapLongLines = false,
  ...props
}: LightweightDiffPreviewProps) {
  return (
    <div
      className={cn("w-full min-w-0 overflow-auto bg-background", className)}
      data-lightweight-diff-preview
      {...props}
    >
      <div
        className={cn(
          "min-w-full font-mono leading-relaxed text-foreground",
          !wrapLongLines && "w-max",
        )}
        data-lightweight-diff-scroll-content
        style={{ fontSize: fontSizePx }}
      >
        {lines.map((line, index) => {
          const lineParts = getLightweightDiffLineParts(line);
          const lineStyles = getLightweightDiffLineStyles(lineParts.kind);

          return (
            <div className="flex min-w-full w-full" key={index} style={lineStyles.rowStyle}>
              {showLineNumbers ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "sticky left-0 z-[1] w-12 shrink-0 select-none border-r border-border px-2 text-right tabular-nums",
                    lineStyles.lineNumberClassName,
                  )}
                  style={lineStyles.gutterStyle}
                >
                  {index + 1}
                </span>
              ) : null}
              <code
                className={cn(
                  "block flex-1 px-3",
                  wrapLongLines ? "whitespace-pre-wrap break-words" : "whitespace-pre",
                )}
              >
                {lineParts.content || " "}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

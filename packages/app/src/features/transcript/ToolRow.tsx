/** 工具行（ADR-0013）：DSH 式极简 disclosure 行——[16px 图标盒] 8 [工具名] 8 [2×2 圆点] 8 [摘要]。
 *
 * 本 module 只做呈现，全部判定取自模型层的归一结果：
 *   · `state` 四态（running / ok / error / stopped）由模型配对结果算出；
 *   · `terminal` 有值即命令类工具（模型按工具名归一），故视图不必维护工具名清单；
 *   · `subCalls` 是内核 details.calls 的嵌套调用，缩进一级递归呈现；
 *     其状态与顶层同词汇（内核 codemode 的 cancelled 已在模型层归一为 stopped）。
 * 状态只走文字色，无彩色徽标；耗时不在行内（DSH 同款取舍）。
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { DisclosureRow } from "../../components/DisclosureRow";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/useLocale";
import { parseToolDiff } from "../../lib/edit-diff";
import { toolIcon } from "./tool-icons";
import type { MessageKey } from "../../lib/i18n";
import type { SubCallItem, ToolCallItem, ToolState } from "../../lib/transcript-model";
import styles from "./transcript.module.css";

/** 状态 → 呈现的唯一映射（新增状态只改这里）。
    行内状态只走文字色（ADR-0013）：运行中 / 取消与摘要同档 tertiary，失败用 danger，
    因此只有 error 需要额外类名；字形负责区分同色的三态。
    gutter 状态点（终端块）是 ADR-0013 明列的例外，保留分档颜色。 */
const STATE_VIEW: Record<
  ToolState,
  { label: MessageKey; dot: string; className?: string; glyph?: ReactNode }
> = {
  running: { label: "stateRunning", dot: styles.dotRunning, glyph: <span className={styles.pulse} /> },
  ok: { label: "stateOk", dot: styles.dotOk },
  error: { label: "stateError", dot: styles.dotError, className: styles.stateError, glyph: <Icon name="warning" size={13} /> },
  stopped: { label: "stateStopped", dot: styles.dotStopped, glyph: <Icon name="pause" size={13} /> },
};

/** 终端 gutter 的状态点：固定 8px，随状态变色（DSH StateDot 的最小版） */
function RunDot({ state }: { state: ToolState }) {
  return <span className={cx(styles.runDot, STATE_VIEW[state].dot)} />;
}

/** 内核把 args 存成 JSON **字符串**：能解析就美化，脏数据原样返回，绝不丢行 */
function prettyArgs(args?: unknown): string {
  if (typeof args !== "string") return args === undefined ? "" : JSON.stringify(args, null, 2);
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

/** 嵌套调用行（内核 details.calls[]）：与工具行同构，只是缩进一级。
    状态词汇与顶层工具行完全一致（内核的 cancelled 已由模型层归一为 stopped）。 */
function SubCallRow({ call }: { call: SubCallItem }) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  const state = call.status;
  const pretty = prettyArgs(call.args);
  const view = state ? STATE_VIEW[state] : undefined;

  return (
    <div className={styles.row}>
      <DisclosureRow
        className={styles.rowHead}
        open={open}
        onClick={() => setOpen((value) => !value)}
        title={view ? t(view.label) : undefined}
      >
        <span className={styles.rowLead}>
          <span className={styles.rowIcon}>
            <Icon name={toolIcon(call.name)} size={14} />
          </span>
          <span className={styles.rowChevron} data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
        </span>
        <span className={styles.rowTitle}>{call.name}</span>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.rowSummary}>{call.summary}</span>
        {state && state !== "ok" && (
          <span className={cx(styles.rowState, view?.className)}>{view?.glyph}</span>
        )}
      </DisclosureRow>
      {open && (
        <div className={styles.rowBody}>
          {pretty && <pre className={styles.codeBody}>{pretty}</pre>}
          {call.error && (
            <pre className={styles.codeBody} data-error="true">
              {call.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolRow({ item }: { item: ToolCallItem }) {
  const [open, setOpen] = useState(false);
  const [showArgs, setShowArgs] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useLocale();
  const isError = item.state === "error";
  // 内核优先（details.diff），patch 兜底（ADR-0013）；两者都没有才回落到请求里的 oldText/newText
  const rows = parseToolDiff(item.diff, item.patch);
  const hasSubCalls = Boolean(item.subCalls?.length);

  /** 复制标准 unified diff（ADR-0013：details.patch 仅供复制/导出） */
  const copyPatch = () => {
    if (!item.patch) return;
    navigator.clipboard
      .writeText(item.patch)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1000);
      })
      .catch(() => {
        // 剪贴板不可用时静默
      });
  };
  // requested（oldText/newText）已经把参数里的编辑对呈现过了：参数收进折叠，
  // 否则同一段文本会以「彩色块 + 转义后的 JSON」两份出现
  const hasRequested = Boolean(item.requested?.length);
  // 命令类工具（模型已归一出 terminal）不展示参数：命令本身就是正文
  const showArgsInline =
    Boolean(item.args) && !item.terminal && !hasSubCalls && rows.length === 0 && !hasRequested;
  const argsBehindToggle =
    Boolean(item.args) && !item.terminal && (hasSubCalls || rows.length > 0 || hasRequested);

  return (
    <div className={styles.row}>
      <DisclosureRow
        className={styles.rowHead}
        open={open}
        title={t(STATE_VIEW[item.state].label)}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.rowLead}>
          <span className={styles.rowIcon}>
            <Icon name={toolIcon(item.name)} size={14} />
          </span>
          <span className={styles.rowChevron} data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
        </span>
        <span className={styles.rowTitle}>{item.name}</span>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.rowSummary}>{item.summary}</span>
        {item.state !== "ok" && (
          <span className={cx(styles.rowState, STATE_VIEW[item.state].className)}>
            {STATE_VIEW[item.state].glyph}
          </span>
        )}
      </DisclosureRow>

      {open && (
        <div className={styles.rowBody}>
          {item.terminal && (
            <div className={styles.terminal}>
              <div className={styles.terminalGutter}>
                <RunDot state={item.state} />
              </div>
              <div className={styles.terminalMain}>
                <div className={styles.terminalCommand}>
                  <span className={styles.terminalPrompt}>$</span> {item.terminal.command}
                </div>
                {item.terminal.output && (
                  <div className={styles.terminalOutputWrap}>
                    <pre className={styles.terminalOutput} data-error={isError}>
                      {item.terminal.output}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className={styles.diff}>
              {item.patch && (
                <div className={styles.diffHead}>
                  <button type="button" className={styles.rowAction} onClick={copyPatch}>
                    {copied ? t("copied") : t("copyDiff")}
                  </button>
                </div>
              )}
              <div className={styles.diffBody}>
                {rows.map((row, index) =>
                  row.kind === "gap" ? (
                    <div key={index} className={cx(styles.diffLine, styles.diffGap)}>
                      <span className={styles.diffMarker} />
                      <span className={styles.diffGutter} />
                      <span className={styles.diffText}>…</span>
                    </div>
                  ) : (
                    <div
                      key={index}
                      className={cx(
                        styles.diffLine,
                        row.kind === "add" && styles.diffAdd,
                        row.kind === "del" && styles.diffDel,
                      )}
                    >
                      <span className={styles.diffMarker} />
                      <span className={styles.diffGutter}>{row.no}</span>
                      <span className={styles.diffText}>
                        {row.kind === "add" ? "+ " : row.kind === "del" ? "- " : "  "}
                        {row.text}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {rows.length === 0 && item.patch && <pre className={styles.codeBody}>{item.patch}</pre>}

          {rows.length === 0 && !item.patch && item.requested && (
            <div className={styles.requested}>
              {item.requested.map((edit, index) => (
                <div key={index}>
                  <pre className={cx(styles.codeBody, styles.requestedOld)}>{edit.oldText}</pre>
                  <pre className={cx(styles.codeBody, styles.requestedNew)}>{edit.newText}</pre>
                </div>
              ))}
            </div>
          )}

          {hasSubCalls && (
            <div className={styles.subCalls}>
              {item.subCalls?.map((call) => <SubCallRow key={call.id} call={call} />)}
            </div>
          )}

          {argsBehindToggle && (
            <>
              <button
                type="button"
                className={styles.rowAction}
                aria-expanded={showArgs}
                onClick={() => setShowArgs((value) => !value)}
              >
                <span className={styles.inspectChevron} data-open={showArgs}>
                  <Icon name="chevron-right" size={11} />
                </span>
                {t("inspectArgs")}
              </button>
              {showArgs && (
                <pre className={styles.codeBody}>{prettyArgs(item.args)}</pre>
              )}
            </>
          )}

          {showArgsInline && <pre className={styles.codeBody}>{prettyArgs(item.args)}</pre>}

          {item.output && !item.terminal && (
            <pre className={styles.codeBody} data-error={isError}>
              {item.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Tool State 的语义层（GLOSSARY「Tool State」）：四态 → 行内标签键 + 色档，
 *  两渲染形态共享的唯一映射；呈现层（Standard 的 glyph/dot 类、TUI 的 SVG 字形/圆点）
 *  各形态自选、按同一 Record 键强制补齐——新增状态只改这里与各形态呈现表，
 *  编译期兜住「两处同步」。
 *  行内状态只走文字色（ADR-0013）；终端块 gutter 状态点保留分档颜色是该条明列的例外。 */
import type { MessageKey } from "./i18n";
import type { ToolState } from "./transcript-model";

export interface ToolStateSemantics {
  /** 行内标签（Standard 的 title/aria；TUI 呈现无文字， tooltip 可复用） */
  label: MessageKey;
  /** 色档：与状态同词汇（四态各自成类，不发明状态色） */
  tone: ToolState;
}

export const TOOL_STATE_VIEW: Record<ToolState, ToolStateSemantics> = {
  running: { label: "stateRunning", tone: "running" },
  ok: { label: "stateOk", tone: "ok" },
  error: { label: "stateError", tone: "error" },
  stopped: { label: "stateStopped", tone: "stopped" },
};

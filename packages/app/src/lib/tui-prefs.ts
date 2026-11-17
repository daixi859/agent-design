/** TUI Mode 前端偏好（ADR-0014）：思考尾部行数。前端偏好存 localStorage、不入 session。
    行数在真实驾驶中先删后还（活跃思考行恢复尾部滚动展示，行数仍可配置）。 */

export const TUI_THINK_LINES_OPTIONS = [1, 3, 5] as const;
export type TuiThinkLines = (typeof TUI_THINK_LINES_OPTIONS)[number];

const TUI_THINK_LINES_KEY = "pi-studio-tui-think-lines";

export function loadTuiThinkLines(): TuiThinkLines {
  const raw = Number(localStorage.getItem(TUI_THINK_LINES_KEY));
  return (TUI_THINK_LINES_OPTIONS as readonly number[]).includes(raw) ? (raw as TuiThinkLines) : 3;
}

export function saveTuiThinkLines(lines: TuiThinkLines): void {
  localStorage.setItem(TUI_THINK_LINES_KEY, String(lines));
  window.dispatchEvent(new Event("pi-studio-tui-think-lines-change"));
}

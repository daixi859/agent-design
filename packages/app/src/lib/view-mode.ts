/** 渲染模式读写（ADR-0014）：TUI Mode / Standard 双形态，前端偏好存 localStorage、不入 session。
    双入口（Session Bar 快切 / Appearance 正式入口）共享状态，窗口事件同步订阅者。 */
export type ViewMode = "standard" | "tui";

const VIEW_MODE_KEY = "pi-studio-view-mode";
const VIEW_MODE_EVENT = "pi-studio-view-mode-change";

export function currentViewMode(): ViewMode {
  return localStorage.getItem(VIEW_MODE_KEY) === "tui" ? "tui" : "standard";
}

export function applyViewMode(mode: ViewMode): void {
  localStorage.setItem(VIEW_MODE_KEY, mode);
  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
}

export { VIEW_MODE_EVENT as VIEW_MODE_CHANGE_EVENT };

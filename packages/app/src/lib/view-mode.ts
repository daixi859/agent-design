/** 渲染模式读写（ADR-0014）：TUI Mode / Standard 双形态，前端偏好存 localStorage、不入 session。
    双入口（Session Bar 快切 / Appearance 正式入口）共享状态，窗口事件同步订阅者。
    默认 TUI（ADR-0014 迭代修订）：显式存 standard 才回 standard，无偏好/脏值一律 TUI。 */
export type ViewMode = "standard" | "tui";

const VIEW_MODE_KEY = "pi-studio-view-mode";
const VIEW_MODE_EVENT = "pi-studio-view-mode-change";

export function currentViewMode(): ViewMode {
  return localStorage.getItem(VIEW_MODE_KEY) === "standard" ? "standard" : "tui";
}

export function applyViewMode(mode: ViewMode): void {
  localStorage.setItem(VIEW_MODE_KEY, mode);
  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
}

export { VIEW_MODE_EVENT as VIEW_MODE_CHANGE_EVENT };

/** 主题读写（旧顶栏逻辑迁出，ADR-0009 后为 Session Bar 与 Settings Appearance 共用）；
    初始应用在 index.html 内联脚本完成，防闪白。 */
export type Theme = "light" | "dark";

const THEME_KEY = "pi-studio-theme";
const THEME_EVENT = "pi-studio-theme-change";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  // 双入口（Session Bar 快捷键 / Appearance 正式入口）共享状态，用窗口事件同步订阅者
  window.dispatchEvent(new Event(THEME_EVENT));
}

export { THEME_EVENT as THEME_CHANGE_EVENT };

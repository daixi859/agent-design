/** 主题读写（自 app/src/lib/theme.ts 移植，存储键独立命名）；
    初始应用在 index.html 内联脚本完成，防闪白。 */
export type Theme = "light" | "dark";

const THEME_KEY = "dsh-ui-theme";
const THEME_EVENT = "dsh-ui-theme-change";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  // 壳顶栏唯一入口，事件同步订阅者（与 i18n 同款模式）
  window.dispatchEvent(new Event(THEME_EVENT));
}

export { THEME_EVENT as THEME_CHANGE_EVENT };

/**
 * 主题协议：与 ZCode 一致，`<html>` 上同时切 `.dark`（明暗）与 `.theme-zai-*`（主题族）。
 * 这里是纯函数层，不含 React——SSR、脚本内联、测试都能直接用。
 */

export type Theme = "light" | "dark" | "zai-light" | "zai-dark";
export type ResolvedTheme = "light" | "dark";

/** localStorage 的键名；换主题不丢用户选择。 */
export const THEME_STORAGE_KEY = "zcode-ui-theme";

/** 缺省主题：无 localStorage 记录时生效（index.html 内联脚本的 fallback 必须同值）。 */
export const DEFAULT_THEME: Theme = "zai-dark";

export const THEMES: readonly { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "zai-light", label: "Zai Light" },
  { value: "zai-dark", label: "Zai Dark" },
] as const;

export function isTheme(value: unknown): value is Theme {
  return (
    value === "light" || value === "dark" || value === "zai-light" || value === "zai-dark"
  );
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "dark" || theme === "zai-dark" ? "dark" : "light";
}

/** 把主题写到 documentElement 上；没有 document（SSR / 测试）时静默跳过。 */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("theme-zai-light", theme === "zai-light");
  root.classList.toggle("theme-zai-dark", theme === "zai-dark");
  root.style.colorScheme = resolved;
}

/** 读已保存主题；localStorage 不可用（隐私模式 / SSR）时回退缺省值。 */
export function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** 持久化主题；写入失败不影响本次切换。 */
export function storeTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存储被禁用：本次切换仍然生效，只是刷新后回到缺省值。
  }
}

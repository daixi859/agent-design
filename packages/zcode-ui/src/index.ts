/**
 * 库入口：组件 + 工具函数 + 主题协议。
 * 预览站（preview/）不在此导出——它属于本仓的开发演示，不是库接口。
 *
 * 消费方还需要引一次样式：`import "@pi-studio/zcode-ui/styles.css"`。
 */
export * from "./components";
export { cn } from "./lib/cn";
export { ThemeContext, useTheme, type ThemeContextValue } from "./lib/theme-context";
export {
  applyTheme,
  DEFAULT_THEME,
  isTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY,
  THEMES,
  type ResolvedTheme,
  type Theme,
} from "./lib/theme";

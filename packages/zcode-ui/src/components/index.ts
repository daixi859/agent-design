/**
 * 组件总桶：ui（通用原子件）+ patterns（带产品假设的组合件）+ ThemeProvider。
 * 只要通用件时请走 `@pi-studio/zcode-ui/ui` 子路径。
 */
export * from "./ui";
export * from "./patterns";
export { ThemeProvider, type ThemeProviderProps } from "./ThemeProvider";

import { createContext, useContext } from "react";

import type { Theme } from "./theme";

export interface ThemeContextValue {
  /** 当前主题（四选一，含 zai 两族）。 */
  theme: Theme;
  /** 当前主题解析后的明暗（供只需要 light / dark 的消费方使用）。 */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** 读主题上下文；没有 ThemeProvider 时报错而不是静默返回缺省值（便于发现漏包）。 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme 必须在 <ThemeProvider> 内使用");
  }
  return value;
}

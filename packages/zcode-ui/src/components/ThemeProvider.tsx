import * as React from "react";

import { ThemeContext, type ThemeContextValue } from "../lib/theme-context";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type Theme,
} from "../lib/theme";

export type ThemeProviderProps = {
  /** 受控主题。传入后组件不再自行持久化，切换完全由上层驱动。 */
  theme?: Theme;
  /** 非受控模式的初始主题；缺省读 localStorage，再缺省 DEFAULT_THEME。 */
  defaultTheme?: Theme;
  /** 非受控模式的切换回调。 */
  onThemeChange?: (theme: Theme) => void;
  /** 是否写入 localStorage，缺省 true（受控模式下不写）。 */
  persist?: boolean;
  children: React.ReactNode;
};

/**
 * 主题提供者：受控 / 非受控两种用法，负责把主题类名同步到 <html>。
 * 协议与 ZCode 一致——消费方只要引了本包的 styles.css，换主题不需要改组件。
 */
export function ThemeProvider({
  theme: controlledTheme,
  defaultTheme,
  onThemeChange,
  persist = true,
  children,
}: ThemeProviderProps) {
  const isControlled = controlledTheme !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState<Theme>(
    () => defaultTheme ?? readStoredTheme(),
  );
  const theme = isControlled ? controlledTheme : uncontrolled;

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      if (!isControlled) {
        setUncontrolled(next);
        if (persist) storeTheme(next);
      }
      onThemeChange?.(next);
    },
    [isControlled, onThemeChange, persist],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolveTheme(theme), setTheme }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

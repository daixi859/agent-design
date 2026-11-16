/** 主题订阅 hook：双入口（Session Bar / Appearance）写同一状态，事件驱动同步 */
import { useCallback, useEffect, useState } from "react";
import {
  THEME_CHANGE_EVENT,
  applyTheme,
  currentTheme,
  type Theme,
} from "../lib/theme";

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const update = useCallback((next: Theme) => applyTheme(next), []);
  return [theme, update];
}

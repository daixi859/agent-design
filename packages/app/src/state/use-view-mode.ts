/** 渲染模式订阅 hook：双入口（Session Bar 快切 / Appearance）写同一状态，事件驱动同步 */
import { useCallback, useEffect, useState } from "react";
import {
  VIEW_MODE_CHANGE_EVENT,
  applyViewMode,
  currentViewMode,
  type ViewMode,
} from "../lib/view-mode";

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(currentViewMode);

  useEffect(() => {
    const sync = () => setMode(currentViewMode());
    window.addEventListener(VIEW_MODE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(VIEW_MODE_CHANGE_EVENT, sync);
  }, []);

  const update = useCallback((next: ViewMode) => applyViewMode(next), []);
  return [mode, update];
}

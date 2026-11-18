/** 思考尾部行数订阅 hook：Appearance 写、TuiGroup 读，事件驱动同步（与 useTheme 同构） */
import { useCallback, useEffect, useState } from "react";
import {
  loadTuiThinkLines,
  saveTuiThinkLines,
  type TuiThinkLines,
} from "../lib/tui-prefs";

const TUI_THINK_LINES_EVENT = "pi-studio-tui-think-lines-change";

export function useTuiThinkLines(): [TuiThinkLines, (lines: TuiThinkLines) => void] {
  const [lines, setLines] = useState<TuiThinkLines>(loadTuiThinkLines);

  useEffect(() => {
    const sync = () => setLines(loadTuiThinkLines());
    window.addEventListener(TUI_THINK_LINES_EVENT, sync);
    return () => window.removeEventListener(TUI_THINK_LINES_EVENT, sync);
  }, []);

  const update = useCallback((next: TuiThinkLines) => saveTuiThinkLines(next), []);
  return [lines, update];
}

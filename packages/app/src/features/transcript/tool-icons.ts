/** pi 工具名 → 图标（ADR-0013）。
 *
 * 内核内置只有 8 个（read / bash / powershell / edit / write / grep / find / ls，
 * docs/research/pi-kernel-notes.md §7.1），其余是扩展工具，实测会话里出现过
 * `codemode` / `Agent` / `get_subagent_result`。**工具名是开放集，不可穷举**，
 * 因此未知一律回退 wrench，而不是漏渲染。
 *
 * 边界说明：ADR-0013 的「视图层不再维护工具名清单」针对的是**语义判定**
 * （哪些是终端类、四态如何归）——那些一律在模型层（`TERMINAL_TOOLS` / `stateOf`）。
 * 这里只做名字到**图标**的呈现映射，不产出任何语义，故留在视图层。
 */
import type { IconName } from "../../ui/Icon";

const TOOL_ICONS: Record<string, IconName> = {
  // 内核内置
  read: "doc",
  write: "pencil",
  edit: "pencil",
  bash: "terminal",
  powershell: "terminal",
  grep: "search",
  find: "search",
  ls: "folder",
  // 实测会出现的扩展工具
  web_fetch: "globe",
  web_search: "globe",
  codemode: "code",
  Agent: "users",
  get_subagent_result: "users",
};

export function toolIcon(name: string): IconName {
  return TOOL_ICONS[name] ?? "wrench";
}

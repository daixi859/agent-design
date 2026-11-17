/** Trigger Menu 的纯逻辑（ADR-0017）：行首 `/` 触发检测 + 命令过滤。
    检测口径（盘问定案）：任意行的首个非空字符为 `/` 且光标仍在该首 token 内，
    不做词边界与 URL 例外——viewer 输入以短指令为主，可预期性优先。 */
import type { IconName } from "../components/Icon";

/** 菜单条目：目录透传命令（落 Command Chip）+ 客户端内建映射（执行后即散，不落 chip） */
export interface MenuCommand {
  name: string;
  trigger: string;
  description?: string;
  argumentHint?: string;
  /** 命令来源（Chip 持久化与图标共用；内建项缺省） */
  source?: "extension" | "prompt" | "skill";
  /** 内建映射（如 compact）：选中即执行，不进 chip 流程 */
  builtin?: "compact";
  icon: IconName;
}

/**
 * 行首 `/` 触发检测：返回光标前已键入的查询串（不含 `/`）。
 * 只认「光标所在行的首个非空字符为 /，且光标未越过首 token 末尾」；
 * `/commit done`（光标在参数里）不触发。
 */
export function detectSlashTrigger(text: string, caret: number): string | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const newline = text.indexOf("\n", caret);
  const lineEnd = newline === -1 ? text.length : newline;
  const line = text.slice(lineStart, lineEnd);
  const indent = line.length - line.trimStart().length;
  const trimmed = line.trimStart();
  const offsetInToken = caret - lineStart - indent;
  if (!trimmed.startsWith("/")) return null;
  // 首 token 末尾（首个空白或行尾）；光标越过即视为在写参数，菜单退场
  const tokenEnd = trimmed.search(/\s|$/);
  if (offsetInToken > tokenEnd) return null;
  return trimmed.slice(1, offsetInToken);
}

/**
 * 命令过滤与排序：精确 → 前缀 → 包含（名称不区分大小写），稳定排序，上限 20 条。
 * 空查询按原序（目录构建序：扩展 → 模板 → skills → 内建）取前 20。
 */
export function filterCommands(items: MenuCommand[], query: string): MenuCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 20);
  const scored: Array<{ rank: number; item: MenuCommand }> = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1;
    if (rank >= 0) scored.push({ rank, item });
  }
  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20)
    .map((entry) => entry.item);
}

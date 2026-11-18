/** Trigger Menu 的纯逻辑（ADR-0017）：行首 `/` 触发检测 + 命令目录映射 + 过滤分组。
    检测口径（盘问定案）：任意行的首个非空字符为 `/` 且光标仍在该首 token 内，
    不做词边界与 URL 例外——viewer 输入以短指令为主，可预期性优先。
    菜单来源三组：目录透传（skills / prompt 模板，扩展命令不入）+ 客户端内建命令
    （compact 等，由 Composer 在 UI 层构造——描述走 i18n，纯逻辑层不持文案）。 */
import type { CommandCatalogItem } from "@pi-studio/shared/protocol";

/** 菜单条目：目录透传命令与内建命令（落 Command Chip） */
export interface MenuCommand {
  name: string;
  trigger: string;
  description?: string;
  argumentHint?: string;
  /** 命令来源（Chip 持久化与分组共用）：builtin = 客户端内建动作，发送时本地兑付 */
  source: "prompt" | "skill" | "builtin";
}

/** 目录条目 → 菜单条目：只收 skills 与 prompt 模板（扩展命令与内建不入菜单），
 *  保持目录序 */
export function menuCommandsFromCatalog(entries: readonly CommandCatalogItem[]): MenuCommand[] {
  return entries
    .filter((entry): entry is CommandCatalogItem & { source: "prompt" | "skill" } =>
      entry.source === "prompt" || entry.source === "skill")
    .map((entry) => ({
      name: entry.name,
      trigger: entry.trigger,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.argumentHint ? { argumentHint: entry.argumentHint } : {}),
      source: entry.source,
    }));
}

/** 分组（GLOSSARY「Trigger Menu」）：技能 → 提示词 → 命令（内建，ADR-0016 补记三）
 *  固定序，与目录序无关；空组不出现 */
export interface MenuCommandGroup {
  source: MenuCommand["source"];
  items: MenuCommand[];
}

const GROUP_ORDER: ReadonlyArray<MenuCommand["source"]> = ["skill", "prompt", "builtin"];

export function groupMenuCommands(items: readonly MenuCommand[]): MenuCommandGroup[] {
  return GROUP_ORDER.map((source) => ({
    source,
    items: items.filter((item) => item.source === source),
  })).filter((group) => group.items.length > 0);
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
 * 空查询按原序（目录构建序：prompt 模板在前、skills 在后；内建命令在末尾）取前 20。
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

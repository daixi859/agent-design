/** 草稿按会话持久化（ADR-0017）：localStorage 语义快照（文本 + Command Chip），
    切会话不丢字。恢复不抢焦点——只回填状态， focus 决策归 Composer。 */

const KEY_PREFIX = "pi-studio-draft:";

/** Chip 状态的持久化形状（与 Composer 的 chip 状态同构；source 坏快照可缺省） */
export interface PersistedChip {
  trigger: string;
  name: string;
  argumentHint?: string;
  source?: "extension" | "prompt" | "skill";
}

export interface ComposerDraft {
  text: string;
  chip?: PersistedChip;
}

export function loadDraft(sessionId: string): ComposerDraft | undefined {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + sessionId);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { text?: unknown; chip?: unknown };
    if (typeof parsed.text !== "string") return undefined;
    const chip =
      parsed.chip && typeof parsed.chip === "object"
        ? (parsed.chip as { trigger?: unknown; name?: unknown; source?: unknown })
        : undefined;
    const source: unknown = chip?.source;
    const validSource: PersistedChip["source"] =
      source === "extension" || source === "prompt" || source === "skill" ? source : undefined;
    const validChip: PersistedChip | undefined =
      chip && typeof chip.trigger === "string" && typeof chip.name === "string"
        ? {
            trigger: chip.trigger,
            name: chip.name,
            ...(validSource ? { source: validSource } : {}),
          }
        : undefined;
    return validChip ? { text: parsed.text, chip: validChip } : { text: parsed.text };
  } catch {
    // 坏快照当无草稿：localStorage 被禁用/损坏都不该挡输入
    return undefined;
  }
}

export function saveDraft(sessionId: string, draft: ComposerDraft): void {
  try {
    localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(draft));
  } catch {
    // 配额/隐私模式：草稿持久化是锦上添花，静默放弃
  }
}

export function clearDraft(sessionId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + sessionId);
  } catch {
    // 同上
  }
}

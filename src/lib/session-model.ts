/** 领域逻辑：活动分支回溯（ADR-0004）、Turn/Group 三层结构（ADR-0006）与 session 级统计 */
import type {
  AssistantMessage,
  BashExecutionMessage,
  MessageEntry,
  SessionEntry,
  SessionInfoEntry,
  ToolCallBlock,
  ToolResultMessage,
} from "../../shared/pi-types";

export interface ActiveBranch {
  /** 根 → 叶（时间正序），不含 header */
  entries: SessionEntry[];
  /** 未落在活动分支上的条目数（被弃分支） */
  abandonedCount: number;
}

/**
 * 活动分支 = 最新叶子沿 parentId 回溯到根的路径（ADR-0004）。
 * 叶子取追加顺序中最后一个未被其它条目引用为父的条目——
 * 与 pi 沿活动叶子取上下文的思路一致，但不做 compaction 投影。
 */
export function buildActiveBranch(entries: SessionEntry[]): ActiveBranch {
  const referenced = new Set<string>();
  for (const entry of entries) {
    if (entry.parentId) referenced.add(entry.parentId);
  }

  let leaf: SessionEntry | undefined;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "session") continue;
    if (!referenced.has(entry.id)) {
      leaf = entry;
      break;
    }
  }
  if (!leaf) return { entries: [], abandonedCount: 0 };

  const byId = new Map(entries.map((e) => [e.id, e]));
  const chain: SessionEntry[] = [];
  const guard = new Set<string>();
  let cursor: SessionEntry | undefined = leaf;
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  chain.reverse();

  const branchIds = new Set(chain.map((e) => e.id));
  const body = chain.filter((e) => e.type !== "session");
  const abandonedCount = entries.filter(
    (e) => e.type !== "session" && !branchIds.has(e.id),
  ).length;
  return { entries: body, abandonedCount };
}

export interface SessionStats {
  assistantMessages: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costTotal: number;
}

/** 顶栏统计口径：活动分支上 assistant 消息内建的 usage（ADR-0004 隐藏级汇总） */
export function computeSessionStats(entries: SessionEntry[]): SessionStats {
  const stats: SessionStats = {
    assistantMessages: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costTotal: 0,
  };
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = (entry as MessageEntry).message;
    if (message.role !== "assistant") continue;
    const assistant = message as AssistantMessage;
    stats.assistantMessages += 1;
    stats.toolCalls += assistant.content.filter((b) => b.type === "toolCall").length;
    if (assistant.usage) {
      stats.inputTokens += assistant.usage.input ?? 0;
      stats.outputTokens += assistant.usage.output ?? 0;
      stats.cacheReadTokens += assistant.usage.cacheRead ?? 0;
      stats.costTotal += assistant.usage.cost?.total ?? 0;
    }
  }
  return stats;
}

/** 活动分支上最后一次模型声明（顶栏展示） */
export function lastModelOnBranch(entries: SessionEntry[]): { provider?: string; modelId?: string } | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "model_change") {
      const { provider, modelId } = entry as { provider?: string; modelId?: string };
      return { provider, modelId };
    }
    if (entry.type === "message") {
      const message = (entry as MessageEntry).message;
      if (message.role === "assistant") {
        const assistant = message as AssistantMessage;
        if (assistant.model) return { provider: assistant.provider, modelId: assistant.model };
      }
    }
  }
  return undefined;
}

// ---------- Turn / Tool Group 三层结构（ADR-0006） ----------

/** 层 3：分组内的单条目 */
export type GroupItem =
  | { kind: "thinking"; id: string; thinking: string; redacted?: boolean }
  | { kind: "toolCall"; id: string; call: ToolCallBlock; result?: ToolResultMessage }
  | { kind: "bashExecution"; id: string; bash: BashExecutionMessage };

/** 层 2/1：Turn 内的条目（组条在轮聚合条之后按原位穿插在回答之间） */
export type TurnItem =
  | { kind: "group"; id: string; group: GroupItem[] }
  | { kind: "text"; id: string; text: string }
  | { kind: "quiet"; id: string; text: string }
  | { kind: "annotation"; id: string; entry: SessionEntry }
  | { kind: "warning"; id: string; note: "aborted" | "error"; message?: string };

/** 层 1：一轮对话（user → 下一条 user 之前的全部内容） */
export interface Turn {
  id: string;
  user?: MessageEntry;
  items: TurnItem[];
}

export interface TurnStructure {
  turns: Turn[];
  /** 首条 user 消息之前的注解（罕见） */
  orphanAnnotations: SessionEntry[];
}

/**
 * 把活动分支切成 Turn → Tool Group 两层（ADR-0006）。
 * 分组以 assistant 的 text 块为分隔符，非文本连续区跨消息归并；
 * 注解级收缩：model_change / thinking_level_change 不渲染，session_info 仅首次。
 */
export function buildTurns(branch: SessionEntry[]): TurnStructure {
  const results = new Map<string, ToolResultMessage>();
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const message = (entry as MessageEntry).message;
    if (message.role === "toolResult") {
      const result = message as ToolResultMessage;
      results.set(result.toolCallId, result);
    }
  }

  const turns: Turn[] = [];
  const orphanAnnotations: SessionEntry[] = [];
  let turn: Turn | undefined;
  let group: GroupItem[] | undefined;
  const namedSeen = new Set<string>();

  const flushGroup = () => {
    if (group?.length && turn) {
      turn.items.push({ kind: "group", id: `group-${group[0].id}`, group });
    }
    group = undefined;
  };
  const ensureTurn = (firstId: string): Turn => {
    if (!turn) {
      turn = { id: firstId, items: [] };
      turns.push(turn);
    }
    return turn;
  };

  for (const entry of branch) {
    if (entry.type !== "message") {
      if (entry.type === "compaction" || entry.type === "branch_summary" || entry.type === "session_info") {
        if (entry.type === "session_info") {
          const name = (entry as SessionInfoEntry).name;
          if (namedSeen.has(name)) continue;
          namedSeen.add(name);
        }
        if (turn) {
          flushGroup();
          turn.items.push({ kind: "annotation", id: entry.id, entry });
        } else {
          orphanAnnotations.push(entry);
        }
      }
      continue;
    }

    const message = (entry as MessageEntry).message;
    switch (message.role) {
      case "user": {
        flushGroup();
        turn = { id: entry.id, user: entry as MessageEntry, items: [] };
        turns.push(turn);
        break;
      }
      case "assistant": {
        const current = ensureTurn(entry.id);
        const assistant = message as AssistantMessage;
        for (const block of assistant.content) {
          if (block.type === "text" && block.text.trim()) {
            flushGroup();
            current.items.push({ kind: "text", id: `${entry.id}-t${current.items.length}`, text: block.text });
          } else if (block.type === "thinking") {
            group ??= [];
            group.push({ kind: "thinking", id: `${entry.id}-k${group.length}`, thinking: block.thinking, redacted: block.redacted });
          } else if (block.type === "toolCall") {
            group ??= [];
            group.push({ kind: "toolCall", id: block.id, call: block, result: results.get(block.id) });
          }
        }
        if (assistant.stopReason === "aborted") {
          flushGroup();
          current.items.push({ kind: "warning", id: `${entry.id}-w`, note: "aborted" });
        } else if (assistant.stopReason === "error") {
          flushGroup();
          current.items.push({ kind: "warning", id: `${entry.id}-w`, note: "error", message: assistant.errorMessage });
        }
        break;
      }
      case "toolResult": {
        const result = message as ToolResultMessage;
        if (results.has(result.toolCallId)) break; // 已并入调用条目
        ensureTurn(entry.id);
        group ??= [];
        group.push({
          kind: "toolCall",
          id: entry.id,
          call: { type: "toolCall", id: result.toolCallId, name: result.toolName },
          result,
        });
        break;
      }
      case "bashExecution": {
        ensureTurn(entry.id);
        group ??= [];
        group.push({ kind: "bashExecution", id: entry.id, bash: message as BashExecutionMessage });
        break;
      }
      case "system":
        break; // 隐藏级（ADR-0004）
      default: {
        const display = (message as { display?: unknown }).display;
        if (typeof display === "string" && display) {
          const current = ensureTurn(entry.id);
          flushGroup();
          current.items.push({ kind: "quiet", id: entry.id, text: display });
        }
      }
    }
  }
  flushGroup();
  return { turns, orphanAnnotations };
}

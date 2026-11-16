/** 领域层唯一派生出口：buildTranscriptModel 把 Entry 列表一次算成 TranscriptModel
    —— Active Branch 回溯（ADR-0004）+ Turn/Tool Group 三层结构（ADR-0006）
    + Composer 徽标所需派生。Entry 树只在实现内部流转，不对外暴露。 */
import type {
  AssistantMessage,
  BashExecutionMessage,
  MessageEntry,
  SessionEntry,
  SessionInfoEntry,
  ToolResultMessage,
} from "../../shared/pi-types";
import { contentText } from "../../shared/message-text";

// ---------- Active Branch（ADR-0004，实现内部） ----------

interface ActiveBranch {
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
function buildActiveBranch(entries: SessionEntry[]): ActiveBranch {
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

/** 活动分支上最后一次模型声明（Composer 徽标） */
function lastModelOnBranch(entries: SessionEntry[]): { provider?: string; modelId?: string } | undefined {
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

// ---------- 显示信息提取（pi 数据 → 显示字段，模型层私有） ----------

/** 头部摘要提取：path > command > pattern > glob > 首个字符串值，无字符串值时回退 args JSON；
    返回未截断原文（截断是视图的呈现约束） */
function summarizeArgs(args?: Record<string, unknown>): string | undefined {
  if (!args) return undefined;
  const value =
    (args.path as string) ??
    (args.command as string) ??
    (args.pattern as string) ??
    (args.glob as string) ??
    Object.values(args).find((v) => typeof v === "string");
  if (typeof value === "string") return value;
  return JSON.stringify(args);
}

/** edit 类工具的结构化 diff（details.diff） */
function extractDiff(details: unknown): string | undefined {
  if (details && typeof details === "object" && "diff" in details) {
    const diff = (details as { diff?: unknown }).diff;
    if (typeof diff === "string" && diff) return diff;
  }
  return undefined;
}

function argsForDisplay(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  return args && Object.keys(args).length > 0 ? args : undefined;
}

// ---------- Turn / Tool Group 三层结构（ADR-0006，实现内部） ----------

/** 层 3：分组内的单条目——归一化后的显示形状（pi 类型只在实现内部流转，不外泄）。
    bashExecution 与孤儿 toolResult 在此归一为 toolCall 条目，视图层零伪造。 */
export type GroupItem =
  | { kind: "thinking"; id: string; thinking: string; redacted?: boolean }
  | {
      kind: "toolCall";
      id: string;
      /** 显示名（bashExecution 归一为 "bash"；孤儿条目取 toolName） */
      name: string;
      /** 原始参数（展开体的 JSON 展示用；空对象归一为 undefined） */
      args?: Record<string, unknown>;
      /** 头部摘要（已提取、未截断） */
      summary?: string;
      /** 结果文本（配对结果 text 块拼接 / bash 输出） */
      output?: string;
      /** 结构化 diff（details.diff 提取） */
      diff?: string;
      /** 结果 isError，或 bash 被取消 / 非零退出 */
      isError: boolean;
    };

/** 工具调用显示条目（ToolCallCard 的消费形状） */
export type ToolCallItem = Extract<GroupItem, { kind: "toolCall" }>;

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

/**
 * 把活动分支切成 Turn → Tool Group 两层（ADR-0006）。
 * 分组以 assistant 的 text 块为分隔符，非文本连续区跨消息归并；
 * 注解级收缩：model_change / thinking_level_change 不渲染，session_info 仅首次。
 */
function buildTurns(branch: SessionEntry[]): { turns: Turn[]; orphanAnnotations: SessionEntry[] } {
  // 预扫：配对表（toolCall → toolResult）与分支上出现过的 toolCall id（孤儿判定依据）
  const results = new Map<string, ToolResultMessage>();
  const callIds = new Set<string>();
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const message = (entry as MessageEntry).message;
    if (message.role === "toolResult") {
      const result = message as ToolResultMessage;
      results.set(result.toolCallId, result);
    } else if (message.role === "assistant") {
      for (const block of (message as AssistantMessage).content) {
        if (block.type === "toolCall") callIds.add(block.id);
      }
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
            const result = results.get(block.id);
            group.push({
              kind: "toolCall",
              id: block.id,
              name: block.name,
              args: argsForDisplay(block.arguments),
              summary: summarizeArgs(block.arguments),
              output: result ? contentText(result.content) : undefined,
              diff: extractDiff(result?.details),
              isError: result?.isError ?? false,
            });
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
        // 配对结果已并入调用条目；孤儿（分支上无前置 toolCall，如中断后的迟到结果）补成合成条目
        if (callIds.has(result.toolCallId)) break;
        ensureTurn(entry.id);
        group ??= [];
        group.push({
          kind: "toolCall",
          id: entry.id,
          name: result.toolName,
          args: undefined,
          summary: undefined,
          output: contentText(result.content),
          diff: extractDiff(result.details),
          isError: result.isError ?? false,
        });
        break;
      }
      case "bashExecution": {
        // 归一为调用显示条目：命令即摘要，取消/非零退出即错误
        const bash = message as BashExecutionMessage;
        ensureTurn(entry.id);
        group ??= [];
        group.push({
          kind: "toolCall",
          id: entry.id,
          name: "bash",
          args: { command: bash.command },
          summary: bash.command,
          output: bash.output,
          diff: undefined,
          isError: bash.cancelled === true || (bash.exitCode !== undefined && bash.exitCode !== 0),
        });
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

// ---------- TranscriptModel：唯一出口 ----------

/** Transcript 渲染所需的完整派生数据（GLOSSARY「TranscriptModel」）；Entry 树不暴露 */
export interface TranscriptModel {
  /** 活动分支切出的 Turn 列表（ADR-0006） */
  turns: Turn[];
  /** 首条 user 消息之前的注解（罕见） */
  orphanAnnotations: SessionEntry[];
  /** 未落在活动分支上的条目数（Session Bar branched 徽标） */
  abandonedCount: number;
  /** 活动分支上最后一次模型声明（Composer 徽标） */
  model?: { provider?: string; modelId?: string };
  /** 活动分支上最后一次 thinking_level_change（Composer 徽标） */
  thinkingLevel?: string;
  /** 活动分支上的工具调用数 = Tool Group 内 toolCall + bashExecution（Composer 徽标） */
  toolCallCount: number;
}

/**
 * 唯一派生入口：Entry 列表进，TranscriptModel 出。
 * 状态层（useSessionDetail）与视图层（Transcript）都只消费这个 interface；
 * 本函数即测试面——黄金样本断言的就是它的返回值。
 */
export function buildTranscriptModel(entries: SessionEntry[]): TranscriptModel {
  const branch = buildActiveBranch(entries);
  const { turns, orphanAnnotations } = buildTurns(branch.entries);

  // 活动分支上最后一次思考等级（Composer 徽标）
  let thinkingLevel: string | undefined;
  for (const entry of branch.entries) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = (entry as { thinkingLevel?: string }).thinkingLevel;
    }
  }

  // 工具调用数从切分结果派生（bashExecution 已归一为 toolCall，一并计入）
  let toolCallCount = 0;
  for (const turn of turns) {
    for (const item of turn.items) {
      if (item.kind !== "group") continue;
      for (const groupItem of item.group) {
        if (groupItem.kind === "toolCall") toolCallCount += 1;
      }
    }
  }

  return {
    turns,
    orphanAnnotations,
    abandonedCount: branch.abandonedCount,
    model: lastModelOnBranch(branch.entries),
    thinkingLevel,
    toolCallCount,
  };
}

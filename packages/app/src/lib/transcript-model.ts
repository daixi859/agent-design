/** 领域层唯一派生出口：buildTranscriptModel 把 Entry 列表一次算成 TranscriptModel
    —— Active Branch 回溯（ADR-0004）+ Turn / Process Group 两层结构（ADR-0006，ADR-0013 修订）
    + Composer 徽标所需派生。Entry 树只在实现内部流转，不对外暴露。

    ADR-0013 修订了两处：
    · 视图层折叠收敛为一级（Recap + Process Strip），模型不再需要一个「轮聚合」层；
      过程与回答的穿插顺序原样保留在 items 里，视图按序平铺即可。
    · 工具条目补 `state`（四态）与 `subCalls`（内核 details.calls 的嵌套调用），
      `terminal` 由本层按工具名归一——视图不必知道哪些工具是终端类。 */
import type {
  AssistantMessage,
  BashExecutionMessage,
  CustomMessageEntry,
  MessageEntry,
  SessionEntry,
  SessionInfoEntry,
  ToolResultMessage,
} from "@pi-studio/shared/pi-types";
import { contentText } from "@pi-studio/shared/message-text";

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

/** edit 类工具的结构化 diff（details.diff）——内核产出，客户端不自己算 */
function extractDiff(details: unknown): string | undefined {
  if (details && typeof details === "object" && "diff" in details) {
    const diff = (details as { diff?: unknown }).diff;
    if (typeof diff === "string" && diff) return diff;
  }
  return undefined;
}

/** edit 类工具的标准 unified diff（details.patch）：ADR-0013 定位为复制/导出用，
    只在 details.diff 缺失时兜底呈现（edit-diff.ts 的 parseToolDiff 负责优先序）。 */
function extractPatch(details: unknown): string | undefined {
  if (details && typeof details === "object" && "patch" in details) {
    const patch = (details as { patch?: unknown }).patch;
    if (typeof patch === "string" && patch) return patch;
  }
  return undefined;
}

/** 历史形态：请求里的 oldText/newText。pi 的 edit 参数有 `edits[]` 与顶层两种形态，
    两者都要兼容。它**不是**内核 diff（没有行号），只在结果没有 diff/patch 时兜底呈现。 */
function extractRequestedEdits(args?: Record<string, unknown>): RequestedEdit[] | undefined {
  if (!args) return undefined;
  const edits: RequestedEdit[] = [];
  if (Array.isArray(args.edits)) {
    for (const item of args.edits) {
      if (!item || typeof item !== "object") continue;
      const { oldText, newText } = item as { oldText?: unknown; newText?: unknown };
      if (typeof oldText === "string" && typeof newText === "string") edits.push({ oldText, newText });
    }
  }
  if (edits.length === 0 && typeof args.oldText === "string" && typeof args.newText === "string") {
    edits.push({ oldText: args.oldText, newText: args.newText });
  }
  return edits.length > 0 ? edits : undefined;
}

/** 内核把嵌套调用放在 details.calls[]，且 `args` 是 **JSON 字符串**（实测行为）。
    形状不合法时整段丢弃，绝不因脏数据抛错。 */
function extractSubCalls(details: unknown): SubCallItem[] | undefined {
  if (!details || typeof details !== "object" || !("calls" in details)) return undefined;
  const raw = (details as { calls?: unknown }).calls;
  if (!Array.isArray(raw)) return undefined;

  const calls: SubCallItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const call = item as Record<string, unknown>;
    if (typeof call.name !== "string") continue;
    calls.push({
      id: typeof call.id === "string" ? call.id : `${call.name}-${calls.length}`,
      name: call.name,
      args: typeof call.args === "string" ? call.args : undefined,
      summary: summarizeSubArgs(call.args),
      status: subCallStatus(call.status),
      error: typeof call.error === "string" ? call.error : undefined,
      durationMs: typeof call.durationMs === "number" ? call.durationMs : undefined,
    });
  }
  return calls.length > 0 ? calls : undefined;
}

/** 嵌套调用的摘要：args 是字符串，能解析出对象就挑一个像路径/命令的值 */
function summarizeSubArgs(args: unknown): string | undefined {
  if (typeof args !== "string") return undefined;
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const value =
      (parsed.path as string) ??
      (parsed.url as string) ??
      (parsed.command as string) ??
      (parsed.code as string) ??
      Object.values(parsed).find((v) => typeof v === "string");
    if (typeof value === "string") return value.replace(/\s+/g, " ");
  } catch {
    // 解析失败：原样返回，视图再截断
  }
  return args.replace(/\s+/g, " ");
}

function argsForDisplay(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  return args && Object.keys(args).length > 0 ? args : undefined;
}

/** 终端类工具：命令即正文，参数与输出同块呈现（pi 的 bash / powershell） */
const TERMINAL_TOOLS = new Set(["bash", "powershell"]);

// ---------- Turn / Process Group 两层结构（ADR-0006，ADR-0013 修订） ----------

/** 工具状态四态（pi 语义）：无配对结果即运行中，取消与失败分开 */
export type ToolState = "running" | "ok" | "error" | "stopped";

/** 请求里的编辑对（历史形态 / 兜底来源）：无行号，故与内核 diff 分开承载 */
export interface RequestedEdit {
  oldText: string;
  newText: string;
}

/** 嵌套调用（内核 details.calls[] 的显示形状） */
export interface SubCallItem {
  id: string;
  name: string;
  /** 原始 JSON **字符串**（内核就这样存），视图负责美化 */
  args?: string;
  summary?: string;
  /** 内核给的是 CodemodeNestedCallStatus（running / ok / error / cancelled），
      在此归一为同一套 Tool State；值缺失或未知时留空——绝不伪造成 ok。 */
  status?: ToolState;
  error?: string;
  durationMs?: number;
}

/** 层 3：过程组内的单条目——归一化后的显示形状（pi 类型只在实现内部流转，不外泄）。
    bashExecution 与孤儿 toolResult 在此归一为 toolCall 条目，视图层零伪造。 */
export type GroupItem =
  | { kind: "thinking"; id: string; thinking: string; redacted?: boolean }
  | {
      kind: "toolCall";
      id: string;
      /** 显示名（bashExecution 归一为 "bash"；孤儿条目取 toolName） */
      name: string;
      /** 原始参数（展开体的 JSON 展示用；命令类工具由视图跳过） */
      args?: Record<string, unknown>;
      /** 头部摘要（已提取、未截断） */
      summary?: string;
      /** 结果文本（配对结果 text 块拼接 / bash 输出） */
      output?: string;
      /** 结构化 diff（details.diff 提取） */
      diff?: string;
      /** 标准 unified diff（details.patch）：diff 缺失时的兜底与复制/导出来源 */
      patch?: string;
      /** 请求里的 oldText/newText：内核没给 diff/patch 时的最后兜底 */
      requested?: RequestedEdit[];
      /** 终端类工具的命令与输出（bash / powershell） */
      terminal?: { command: string; output?: string };
      /** 嵌套调用（codemode 等） */
      subCalls?: SubCallItem[];
      state: ToolState;
    };

/** 工具调用显示条目（ToolRow 的消费形状） */
export type ToolCallItem = Extract<GroupItem, { kind: "toolCall" }>;

/** Recap 的结算事实（GLOSSARY「Recap」）：只数可解释的量。
    ADR-0013 写「N 步」——动作数 = 工具数 + 思考数，与这两档重复，故不单独承载。 */
export interface GroupRecap {
  tools: number;
  thoughts: number;
  /** 其中失败的工具数（error 态） */
  failed: number;
}

/** 层 2：Turn 内的条目——过程组与回答按源顺序交替（text 是分隔符，也是分组边界） */
export type TurnItem =
  | { kind: "group"; id: string; group: GroupItem[]; recap: GroupRecap }
  | { kind: "text"; id: string; text: string }
  | { kind: "quiet"; id: string; text: string }
  | { kind: "annotation"; id: string; entry: SessionEntry }
  | { kind: "warning"; id: string; note: "aborted" | "error"; message?: string };

/** 层 1：一轮对话（user → 下一条 user 之前的全部内容） */
export interface Turn {
  id: string;
  user?: MessageEntry;
  items: TurnItem[];
  /** 被弃分支数——只挂在首个 Turn 上（Recap 标注用），避免每轮重复同一个数 */
  abandonedCount?: number;
  /** 本轮耗时（末条目 − user 条目）；任一侧缺时间戳时留空，不发明 */
  durationMs?: number;
  /** 本轮 tokens（assistant.usage.totalTokens 累加）；内核未给 usage 时留空 */
  tokens?: number;
  /** 本轮仍挂在内核流式草稿上（GLOSSARY「Draft」）：末条 assistant 是 stopReason "pending"。
      草稿是瞬态叠加，权威条目落盘后该标记自然消失——视图据此把 Draft 与落盘条目区分开。 */
  draft?: boolean;
}

/** 配对结果 → 显示状态 */
function stateOf(result: ToolResultMessage | undefined): ToolState {
  if (!result) return "running"; // 无配对结果：内核还在跑，或流式草稿
  return result.isError ? "error" : "ok";
}

/** 内核 CodemodeNestedCallStatus → 本项目的 Tool State。
    cancelled 与顶层 bashExecution 的 stopped 同义，故归一为 stopped，
    全应用只保留一套状态词汇；未知或缺失返回 undefined。 */
function subCallStatus(value: unknown): ToolState | undefined {
  switch (value) {
    case "running":
      return "running";
    case "ok":
      return "ok";
    case "error":
      return "error";
    case "cancelled":
      return "stopped";
    default:
      return undefined;
  }
}

/**
 * 把活动分支切成 Turn → Process Group 两层（ADR-0006）。
 * 分组以 assistant 的 text 块为分隔符，非文本连续区跨消息归并；
 * 穿插顺序原样保留（text 与 group 在 items 里按源顺序交替）——
 * 这正是「同一条 assistant 消息里 text→tool→text」能被正确分组的依据。
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
  /** 当前轮的结算（turn 切换时重置）；j 与 turns 同步推进 */
  let settlement: TurnSettlement | undefined;
  let settled: TurnSettlement[] = [];
  const namedSeen = new Set<string>();

  const flushGroup = () => {
    if (group?.length && turn) {
      const tools = group.filter((item) => item.kind === "toolCall");
      turn.items.push({
        kind: "group",
        id: `group-${group[0].id}`,
        group,
        recap: {
          tools: tools.length,
          thoughts: group.length - tools.length,
          failed: tools.filter((item) => item.state === "error").length,
        },
      });
    }
    group = undefined;
  };
  const ensureTurn = (firstId: string): Turn => {
    if (!turn) {
      turn = { id: firstId, items: [] };
      settlement = {};
      settled.push(settlement);
      turns.push(turn);
    }
    return turn;
  };

  for (const entry of branch) {
    // user 条目开启新一轮，它的时间戳属于新 Turn——留给下面 user 分支累加
    const opensTurn =
      entry.type === "message" && (entry as MessageEntry).message.role === "user";
    if (!opensTurn && turn && settlement) accumulate(settlement, entry);
    if (entry.type !== "message") {
      // 注解级（ADR-0004）：扩展注入的用户可见消息（display:true）按注解呈现，display:false 隐藏
      const isAnnotation =
        entry.type === "compaction" ||
        entry.type === "branch_summary" ||
        entry.type === "session_info" ||
        (entry.type === "custom_message" && (entry as CustomMessageEntry).display !== false);
      if (isAnnotation) {
        if (entry.type === "session_info") {
          const name = (entry as SessionInfoEntry).name;
          // 上游允许 name 缺失（清名）：没有可展示的内容，跳过而非渲染空命名
          if (!name) continue;
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
        settlement = {};
        settled.push(settlement);
        accumulate(settlement, entry);
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
            const output = result ? contentText(result.content) : undefined;
            const command = block.arguments?.command;
            group.push({
              kind: "toolCall",
              id: block.id,
              name: block.name,
              args: argsForDisplay(block.arguments),
              summary: summarizeArgs(block.arguments),
              output,
              diff: extractDiff(result?.details),
              patch: extractPatch(result?.details),
              requested: extractRequestedEdits(block.arguments),
              subCalls: extractSubCalls(result?.details),
              terminal:
                TERMINAL_TOOLS.has(block.name) && typeof command === "string"
                  ? { command, output }
                  : undefined,
              state: stateOf(result),
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
          patch: extractPatch(result.details),
          requested: undefined,
          subCalls: extractSubCalls(result.details),
          terminal: undefined,
          state: result.isError ? "error" : "ok",
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
          subCalls: undefined,
          terminal: { command: bash.command, output: bash.output },
          state: bash.cancelled === true ? "stopped" : bash.exitCode !== undefined && bash.exitCode !== 0 ? "error" : "ok",
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

  // 结算：耗时 = 末条目 − 首条目（同一时刻不报），tokens 只在真累到时报
  turns.forEach((item, index) => {
    const s = settled[index];
    if (!s) return;
    if (s.first !== undefined && s.last !== undefined && s.last > s.first) {
      item.durationMs = s.last - s.first;
    }
    if (s.tokens !== undefined) item.tokens = s.tokens;
    if (s.draft) item.draft = true;
  });

  return { turns, orphanAnnotations };
}

/** 时间戳 → 毫秒；EntryBase.timestamp 是 ISO 字符串，消息里的 timestamp 是毫秒数 */
function timeOf(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** 本轮结算：切分时按条目顺序内联累加（不按 id 反查——合成 item id 不等于 entry id）。
    只累加内核真给了的：时间戳缺就不报耗时，usage 缺就不报 tokens。 */
interface TurnSettlement {
  first?: number;
  last?: number;
  tokens?: number;
  /** 末条 assistant 仍是 pending（stopReason "pending"）——即内核流式草稿尚未被权威条目取代 */
  draft?: boolean;
}

/** 把一个条目喂进本轮结算：时间取最早/最晚，tokens 只取 assistant 的 totalTokens */
function accumulate(settlement: TurnSettlement, entry: SessionEntry): void {
  const message = entry.type === "message" ? (entry as MessageEntry).message : undefined;
  const at = timeOf(entry.timestamp) ?? timeOf((message as { timestamp?: number } | undefined)?.timestamp);
  if (at !== undefined) {
    if (settlement.first === undefined || at < settlement.first) settlement.first = at;
    if (settlement.last === undefined || at > settlement.last) settlement.last = at;
  }
  if (message?.role !== "assistant") return;
  const assistant = message as AssistantMessage;
  const usage = assistant.usage;
  if (usage?.totalTokens !== undefined) settlement.tokens = (settlement.tokens ?? 0) + usage.totalTokens;
  // Draft 判定：内核流式期的 assistant 落盘时 stopReason 停在 pending（ADR-0012 的瞬态草稿）
  settlement.draft = assistant.stopReason === "pending";
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
  /** 活动分支上的工具调用数 = Process Group 内 toolCall + bashExecution（Composer 徽标） */
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

  // 被弃分支数只标注在首个 Turn 上（Recap 用），避免每轮重复
  if (turns[0] && branch.abandonedCount > 0) {
    turns[0].abandonedCount = branch.abandonedCount;
  }


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

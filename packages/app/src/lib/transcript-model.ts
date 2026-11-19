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
  BranchSummaryEntry,
  CompactionEntry,
  CustomMessageEntry,
  MessageEntry,
  SessionEntry,
  SessionInfoEntry,
  ToolResultMessage,
  UserMessage,
} from "@pi-studio/shared/pi-types";
import { contentBlocks, contentText } from "@pi-studio/shared/message-text";

// ---------- Active Branch（ADR-0004，实现内部） ----------

interface ActiveBranch {
  /** 根 → 叶（时间正序），不含 header */
  entries: SessionEntry[];
  /** 未落在活动分支上的条目数（被弃分支） */
  abandonedCount: number;
}

/**
 * 活动分支的叶子 id（ADR-0004）：追加顺序中最后一个未被其它条目引用为父的非 session 条目——
 * 与 pi 沿活动叶子取上下文的思路一致，但不做 compaction 投影。
 * 导出给驱动视图的合成层：瞬态条目（待回显 / 流式草稿）必须挂到这个叶子上，
 * 挂空（parentId null）会被这里的叶子扫描当成新根，整条真实分支反被判成「被弃」。
 */
export function activeLeafId(entries: readonly SessionEntry[]): string | null {
  const referenced = new Set<string>();
  for (const entry of entries) {
    if (entry.parentId) referenced.add(entry.parentId);
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "session") continue;
    if (!referenced.has(entry.id)) return entry.id;
  }
  return null;
}

/** 活动分支 = 叶子沿 parentId 回溯到根的路径（ADR-0004） */
function buildActiveBranch(entries: SessionEntry[]): ActiveBranch {
  const leafId = activeLeafId(entries);
  if (!leafId) return { entries: [], abandonedCount: 0 };
  const leaf = entries.find((e) => e.id === leafId);

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
  | { kind: "thinking"; id: string; thinking: string; redacted?: boolean; /** 条目时间戳（TUI 活跃思考行的流逝秒数锚，ADR-0014）；内核无思考独立时长，结算后无数据不显示 */ startedAt?: number; /** 所在 assistant 条目的请求耗时（内核给的，思考占其主体）：完成思考行的耗时展示 */ durationMs?: number; /** 流式草稿的思考已定稿（内核 thinking_end，ADR-0012 补记九）：完成后思考行即收起 */ thinkingComplete?: boolean }
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
      /** 运行秒数锚（running 态有意义）：调用所在 assistant 条目的毫秒时间戳——
          双路径统一取条目时间戳，不依赖客户端起表（ADR-0014）；缺时间戳留空 */
      startedAt?: number;
      /** 执行耗时（内核单调时钟，落盘 toolResult 携带）；结算行的秒数显示 */
      durationMs?: number;
      /** 执行期输出尾巴（running 态、驱动路径独有；ADR-0012 补记八） */
      live?: LiveToolOutput;
      state: ToolState;
    };

/** 工具调用显示条目（ToolRow 的消费形状） */
export type ToolCallItem = Extract<GroupItem, { kind: "toolCall" }>;

/** 运行中工具的实时输出尾巴（ADR-0012 补记八）：执行期输出无条目载体，
    由驱动层经可选入参汇入同一出口；Live Tail 不传即无尾巴（两路径能力差异是明示的） */
export interface LiveToolOutput {
  outputTail: string;
  /** 输出全文长度（> outputTail.length = 输出仍在增长） */
  totalLen?: number;
}

/** 运行中工具的实时尾巴表（toolCallId → 尾巴），buildTranscriptModel 的可选入参 */
export type LiveTools = Record<string, LiveToolOutput>;

/** Recap 的结算事实（GLOSSARY「Recap」）：只数可解释的量。
    ADR-0013 写「N 步」——动作数 = 工具数 + 思考数，与这两档重复，故不单独承载。
    running / toolCounts / startedAt 是 TUI Mode 的运行态派生量（ADR-0014），
    Standard 视图不消费即零改动。 */
export interface GroupRecap {
  tools: number;
  thoughts: number;
  /** 其中失败的工具数（error 态） */
  failed: number;
  /** 组内仍有 running 工具（TUI 摘要行运行态的判定） */
  running: boolean;
  /** 组内工具按名聚合计数（首次出现序）；不去重、不排除 edit/write（ADR-0014） */
  toolCounts: { name: string; count: number }[];
  /** 组首条目毫秒时间戳（运行态秒数锚，挂钟求值）；缺时间戳时留空，不发明 */
  startedAt?: number;
  /** 组内条目时间跨度（结算态「Ran for」的秒数）；缺时间戳时留空 */
  durationMs?: number;
}

/** 正典空 Recap（ADR-0014 首 token 前空窗锚组用）：零值事实的单一来源，
 *  视图不再现场捏造字面量 */
export function emptyGroupRecap(): GroupRecap {
  return { tools: 0, thoughts: 0, failed: 0, running: false, toolCounts: [] };
}

/** 注解条目的归一显示形状（C5）：Entry 树不出接口——分类在本层一次完成，视图不再
 *  持 wire 类型的 switch / 强转 / sections 手解析。文案与图标仍归视图（模型层零 i18n），
 *  这里只定「是哪类注解、携带什么显示数据」。
 *  与 GLOSSARY 同族对应：injection = Context Injection（可展开行）、systemPrompt =
 *  System Prompt（可展开行）、其余三类为细分隔线注解（ADR-0004 三级呈现策略）。 */
export type AnnotationDisplay =
  | { kind: "sessionInfo"; name: string }
  | { kind: "branchSummary"; summary?: string }
  | { kind: "compaction"; tokensBefore?: number }
  | { kind: "injection"; customType?: string; body: string; details?: unknown }
  | { kind: "systemPrompt"; sections: Record<string, string> };

/** 注解载体的对外形状（orphanAnnotations 的元素）：条目 id + 归一显示形状 */
export interface AnnotationCarrier {
  id: string;
  display: AnnotationDisplay;
}

/** 注解分类（实现内部）：五类各有显示数据，不属注解通道的条目回 undefined。
 *  既有过滤口径在此一并收拢：session_info 空名不可展示、custom_message display:false
 *  隐藏、system 空 sections（内核空 diff 落盘）跳过。 */
function annotationDisplayOf(entry: SessionEntry): AnnotationDisplay | undefined {
  switch (entry.type) {
    case "session_info": {
      // 上游允许 name 缺失（清名）：没有可展示的内容
      const name = (entry as SessionInfoEntry).name;
      return name ? { kind: "sessionInfo", name } : undefined;
    }
    case "branch_summary": {
      const summary = (entry as BranchSummaryEntry).summary;
      return { kind: "branchSummary", ...(summary ? { summary } : {}) };
    }
    case "compaction": {
      const tokensBefore = (entry as CompactionEntry).tokensBefore;
      return { kind: "compaction", ...(tokensBefore !== undefined ? { tokensBefore } : {}) };
    }
    case "custom_message": {
      // 扩展注入的用户可见消息（display:true）按注解呈现，display:false 隐藏
      const custom = entry as CustomMessageEntry;
      if (custom.display === false) return undefined;
      return {
        kind: "injection",
        customType: custom.customType,
        body: contentText(custom.content).trim(),
        ...(custom.details !== undefined && custom.details !== null ? { details: custom.details } : {}),
      };
    }
    default:
      return undefined;
  }
}

/** user 气泡的归一显示形状（C5）：wire 的 MessageEntry 不出接口——只取视图要画的
 *  内容块（text / image）与条目级时间戳（ISO；时钟解析归视图） */
export interface UserMessageDisplay {
  timestamp: string;
  parts: Array<{ kind: "text"; text: string } | { kind: "image"; mimeType?: string; data?: string }>;
}

function userDisplayOf(entry: MessageEntry): UserMessageDisplay {
  const parts: UserMessageDisplay["parts"] = [];
  for (const block of contentBlocks((entry.message as UserMessage).content)) {
    if (block.type === "text") parts.push({ kind: "text", text: block.text });
    else if (block.type === "image")
      parts.push({
        kind: "image",
        ...(block.mimeType ? { mimeType: block.mimeType } : {}),
        ...(block.data ? { data: block.data } : {}),
      });
  }
  return { timestamp: entry.timestamp, parts };
}

/** 层 2：Turn 内的条目——过程组与回答按源顺序交替（text 是分隔符，也是分组边界） */
export type TurnItem =
  | { kind: "group"; id: string; group: GroupItem[]; recap: GroupRecap }
  | { kind: "text"; id: string; text: string }
  | { kind: "quiet"; id: string; text: string }
  | { kind: "annotation"; id: string; display: AnnotationDisplay }
  | { kind: "warning"; id: string; note: "aborted" | "error"; message?: string };

/** 过程组条目（钻取选择子与视图的收窄别名） */
export type GroupTurnItem = Extract<TurnItem, { kind: "group" }>;

/** 层 1：一轮对话（user → 下一条 user 之前的全部内容） */
export interface Turn {
  id: string;
  /** user 气泡的归一显示形状（wire 的 MessageEntry 不出接口，C5） */
  user?: UserMessageDisplay;
  items: TurnItem[];
  /** 被弃分支数——只挂在首个 Turn 上（Recap 标注用），避免每轮重复同一个数 */
  abandonedCount?: number;
  /** 本轮耗时（末条目 − user 条目）；任一侧缺时间戳时留空，不发明 */
  durationMs?: number;
  /** 本轮 tokens（assistant.usage.totalTokens 累加）；内核未给 usage 时留空 */
  tokens?: number;
  /** 本轮工具命令总数（各过程组 tools 之和，ADR-0014）：TUI 结算汇总行的数据源 */
  toolsTotal?: number;
  /** 本轮思考总数（各过程组 thoughts 之和，ADR-0014）：纯思考轮汇总行的数据源 */
  thoughtsTotal?: number;
  /** 首个过程组 id（Recap 只报一次的量——被弃分支数与 turn 级结算挂它头上）；本轮无组时缺省 */
  firstGroupId?: string;
  /** 末个过程组 id（ADR-0014：TUI 贴底抽取的目标组）；本轮无组时缺省 */
  tailGroupId?: string;
  /** 末个条目 id（ADR-0014：组被正文 flush 终结后不再是尾部，活跃思考权以此判定）；空轮缺省 */
  tailItemId?: string;
  /** user 条目时刻（ms，ADR-0014：TUI 首 token 前空窗运行指示的计时锚）；无 user 或坏时间戳缺省 */
  userAt?: number;
  /** 本轮末条目时刻（ADR-0014）：汇总行的完成时间 */
  endAt?: number;
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


// ---------- Turn / Process Group 增量构建器（ADR-0006 结构；C6 增量缝） ----------

/**
 * 把活动分支切成 Turn → Process Group 两层（ADR-0006）。
 * 分组以 assistant 的 text 块为分隔符，非文本连续区跨消息归并；穿插顺序原样保留。
 * 注解级收缩：model_change / thinking_level_change 不渲染，session_info 仅首次。
 *
 * C6 起：构建态住 TurnsBuilder，buildTranscriptModel 以单槽缓存驱动它增量 extend——
 * 预扫表与分支链随帧累积，turn 按 checkpoint（user 边界）回退重建，delta 帧只重算
 * 尾部那一轮；任何增量判据不满足即整体重建（全量路径与旧实现逐行同构）。
 */

/** 预扫表（配对与孤儿判定）：分支条目的 toolResult / assistant toolCall 索引。
 *  条目 id 全局唯一、永不复用——尾部换帧后旧尾的残留键无害，表只增不删。 */
interface PrescanTables {
  results: Map<string, ToolResultMessage>;
  callIds: Set<string>;
}

/** 分支链元素（带原始数组下标：turn 复用判定要把 raw 分歧点映射到链下标） */
interface ChainLink {
  index: number;
  entry: SessionEntry;
}

/** builder 的可回退检查点：仅在「turn 关闭」（下一 user 边界）处打点——此刻开组状态
 *  为空、上一轮已结算，状态可由少量标量整体恢复 */
interface BuilderCheckpoint {
  /** 已消费的分支条目数 */
  consumed: number;
  turnsLen: number;
  orphanLen: number;
  namedSeen: Set<string>;
  /** 当前（已结算但仍是注解挂靠目标的）turn */
  turn: Turn | undefined;
  settlement: TurnSettlement | undefined;
}

class TurnsBuilder {
  readonly turns: Turn[] = [];
  readonly orphanAnnotations: AnnotationCarrier[] = [];
  /** 各 turn 的分支区间 [start, end)：end 随结算推进（开口末轮 = 已消费数） */
  readonly spans: Array<{ start: number; end: number }> = [];
  readonly checkpoints: BuilderCheckpoint[] = [];
  /** 预扫表由缓存层维护（增量累积），构建循环只读 */
  private readonly tables: PrescanTables;
  private namedSeen = new Set<string>();
  private turn: Turn | undefined;
  private currentSettlement: TurnSettlement | undefined;
  private group: GroupItem[] | undefined;
  private groupStartedAt: number | undefined;
  private groupLastAt: number | undefined;
  private groupFallbackDuration: number | undefined;
  /** 已消费的分支条目数 */
  consumed = 0;

  constructor(tables: PrescanTables) {
    this.tables = tables;
  }

  /** 结算一轮：全部派生量从 items + settlement 现算（幂等——末轮随帧反复结算） */
  private settleTurn(turn: Turn, s: TurnSettlement): void {
    if (s.first !== undefined && s.last !== undefined && s.last > s.first) turn.durationMs = s.last - s.first;
    else delete turn.durationMs;
    if (s.last !== undefined) turn.endAt = s.last;
    else delete turn.endAt;
    if (s.tokens !== undefined) turn.tokens = s.tokens;
    else delete turn.tokens;
    if (s.draft) turn.draft = true;
    else delete turn.draft;
    turn.firstGroupId = turn.items.find((child) => child.kind === "group")?.id;
    turn.tailGroupId = [...turn.items].reverse().find((child) => child.kind === "group")?.id;
    turn.tailItemId = turn.items.at(-1)?.id;
    turn.userAt = turn.user ? Date.parse(turn.user.timestamp) || undefined : undefined;
    // 本轮工具命令总数与思考总数（ADR-0014）：TUI 结算汇总行的数据源
    let total = 0;
    let thoughts = 0;
    for (const item of turn.items) {
      if (item.kind === "group") {
        total += item.recap.tools;
        thoughts += item.recap.thoughts;
      }
    }
    if (total > 0) turn.toolsTotal = total;
    else delete turn.toolsTotal;
    if (thoughts > 0) turn.thoughtsTotal = thoughts;
    else delete turn.thoughtsTotal;
  }

  /** 上一轮出界（结算 + 区间收口 + 检查点）；当前轮不存在时 no-op */
  private closeTurn(): void {
    if (!this.turn || !this.currentSettlement) return;
    this.settleTurn(this.turn, this.currentSettlement);
    this.spans[this.spans.length - 1].end = this.consumed;
    this.checkpoints.push({
      consumed: this.consumed,
      turnsLen: this.turns.length,
      orphanLen: this.orphanAnnotations.length,
      namedSeen: new Set(this.namedSeen),
      turn: this.turn,
      settlement: { ...this.currentSettlement },
    });
  }

  private ensureTurn(firstId: string): Turn {
    if (!this.turn) {
      this.turn = { id: firstId, items: [] };
      this.currentSettlement = {};
      this.spans.push({ start: this.consumed, end: this.consumed });
      this.turns.push(this.turn);
    }
    return this.turn;
  }

  /** 开组（无则开）并记组首/组末条目时间戳——运行态秒数锚取组首、结算时长取末 − 首
   *  （ADR-0014），缺时间戳一侧就不报，不发明 */
  private ensureGroup(entry: SessionEntry): GroupItem[] {
    const message = entry.type === "message" ? (entry as MessageEntry).message : undefined;
    const at = timeOf(entry.timestamp) ?? timeOf((message as { timestamp?: number } | undefined)?.timestamp);
    if (!this.group) {
      this.group = [];
      this.groupStartedAt = at;
    }
    if (at !== undefined) this.groupLastAt = this.groupLastAt === undefined ? at : Math.max(this.groupLastAt, at);
    if (message?.role === "assistant") {
      const duration = (message as AssistantMessage).durationMs;
      if (typeof duration === "number") this.groupFallbackDuration = duration;
    }
    return this.group;
  }

  private flushGroup(): void {
    if (this.group?.length && this.turn) {
      const tools = this.group.filter((item) => item.kind === "toolCall");
      // 分类计数：按工具名聚合、首次出现序；不去重、不排除 edit/write（ADR-0014）
      const counts = new Map<string, number>();
      for (const item of tools) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
      this.turn.items.push({
        kind: "group",
        id: `group-${this.group[0].id}`,
        group: this.group,
        recap: {
          tools: tools.length,
          thoughts: this.group.length - tools.length,
          failed: tools.filter((item) => item.state === "error").length,
          running: tools.some((item) => item.state === "running"),
          toolCounts: [...counts].map(([name, count]) => ({ name, count })),
          ...(this.groupStartedAt !== undefined ? { startedAt: this.groupStartedAt } : {}),
          ...(this.groupStartedAt !== undefined &&
          this.groupLastAt !== undefined &&
          this.groupLastAt > this.groupStartedAt
            ? { durationMs: this.groupLastAt - this.groupStartedAt }
            : this.groupFallbackDuration !== undefined
              ? { durationMs: this.groupFallbackDuration }
              : {}),
        },
      });
    }
    this.group = undefined;
    this.groupStartedAt = undefined;
    this.groupLastAt = undefined;
    this.groupFallbackDuration = undefined;
  }

  /** 消费一批分支条目（预扫表已含它们的贡献）；builder 状态可由检查点恢复后增量续跑。
   *  瞬态入参只作用在本批新建的条目上——重放的尾部区域拿到的就是当前帧的尾巴。 */
  extend(entries: readonly SessionEntry[], liveTools?: LiveTools, draftHint?: DraftThinking): void {
    for (const entry of entries) {
      // user 条目开启新一轮，它的时间戳属于新 Turn——留给下面 user 分支累加
      const opensTurn = entry.type === "message" && (entry as MessageEntry).message.role === "user";
      if (!opensTurn && this.turn && this.currentSettlement) accumulate(this.currentSettlement, entry);
      if (entry.type !== "message") {
        // 注解级（ADR-0004）：分类在 annotationDisplayOf 一处完成（display:false / 空名
        // 等过滤口径同层收拢）；session_info 同名去重是呈现事实，留在切分层
        const display = annotationDisplayOf(entry);
        if (display) {
          if (display.kind === "sessionInfo") {
            if (this.namedSeen.has(display.name)) continue;
            this.namedSeen.add(display.name);
          }
          if (this.turn) {
            this.flushGroup();
            this.turn.items.push({ kind: "annotation", id: entry.id, display });
          } else {
            this.orphanAnnotations.push({ id: entry.id, display });
          }
        }
        this.consumed += 1;
        continue;
      }

      const message = (entry as MessageEntry).message;
      switch (message.role) {
        case "user": {
          this.flushGroup();
          this.closeTurn();
          this.turn = { id: entry.id, user: userDisplayOf(entry as MessageEntry), items: [] };
          this.currentSettlement = {};
          this.spans.push({ start: this.consumed, end: this.consumed });
          this.turns.push(this.turn);
          accumulate(this.currentSettlement, entry);
          break;
        }
        case "assistant": {
          const current = this.ensureTurn(entry.id);
          const assistant = message as AssistantMessage;
          const entryAt = timeOf(entry.timestamp) ?? timeOf(assistant.timestamp);
          for (const block of assistant.content) {
            if (block.type === "text" && block.text.trim()) {
              this.flushGroup();
              current.items.push({ kind: "text", id: `${entry.id}-t${current.items.length}`, text: block.text });
            } else if (block.type === "thinking") {
              const items = this.ensureGroup(entry);
              // durationMs = 所在 assistant 条目的请求耗时（思考是请求主体）：完成思考行的耗时；
              // thinkingComplete 只标在调用方指认的草稿条目上（内核 thinking_end 定稿信号）
              items.push({
                kind: "thinking",
                id: `${entry.id}-k${items.length}`,
                thinking: block.thinking,
                redacted: block.redacted,
                startedAt: entryAt,
                durationMs: assistant.durationMs,
                ...(draftHint?.entryId === entry.id && draftHint.thinkingComplete ? { thinkingComplete: true } : {}),
              });
            } else if (block.type === "toolCall") {
              const items = this.ensureGroup(entry);
              const result = this.tables.results.get(block.id);
              const output = result ? contentText(result.content) : undefined;
              const command = block.arguments?.command;
              const state = stateOf(result);
              // 执行期输出尾巴（ADR-0012 补记八）：仅 running 态注入，结算态权威输出在 output 里
              const tail = state === "running" ? liveTools?.[block.id] : undefined;
              items.push({
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
                ...(entryAt !== undefined ? { startedAt: entryAt } : {}),
                ...(result?.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
                ...(tail ? { live: tail } : {}),
                state,
              });
            }
          }
          if (assistant.stopReason === "aborted") {
            this.flushGroup();
            current.items.push({ kind: "warning", id: `${entry.id}-w`, note: "aborted" });
          } else if (assistant.stopReason === "error") {
            this.flushGroup();
            current.items.push({ kind: "warning", id: `${entry.id}-w`, note: "error", message: assistant.errorMessage });
          }
          break;
        }
        case "toolResult": {
          const result = message as ToolResultMessage;
          // 配对结果已并入调用条目；孤儿（分支上无前置 toolCall，如中断后的迟到结果）补成合成条目
          if (this.tables.callIds.has(result.toolCallId)) break;
          this.ensureTurn(entry.id);
          this.ensureGroup(entry).push({
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
            ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
            state: result.isError ? "error" : "ok",
          });
          break;
        }
        case "bashExecution": {
          // 归一为调用显示条目：命令即摘要，取消/非零退出即错误
          const bash = message as BashExecutionMessage;
          this.ensureTurn(entry.id);
          this.ensureGroup(entry).push({
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
        case "system": {
          // 系统提示词条目（ADR-0004 修订三）：content 为空串，全文在 message.sections
          // （project_context 段即 AGENTS.md 等项目说明的渲染）。落注解通道渲染为可展开行，
          // 首条 user 之前（常见位置）自然落入 orphanAnnotations；
          // 内核空 diff 也会落盘 sections:{} 条目，无可展示内容，跳过。
          const sections = (message as { sections?: Record<string, string> }).sections;
          if (!sections || Object.keys(sections).length === 0) break;
          const display: AnnotationDisplay = { kind: "systemPrompt", sections };
          if (this.turn) {
            this.flushGroup();
            this.turn.items.push({ kind: "annotation", id: entry.id, display });
          } else {
            this.orphanAnnotations.push({ id: entry.id, display });
          }
          break;
        }
        default: {
          const display = (message as { display?: unknown }).display;
          if (typeof display === "string" && display) {
            const current = this.ensureTurn(entry.id);
            this.flushGroup();
            current.items.push({ kind: "quiet", id: entry.id, text: display });
          }
        }
      }
      this.consumed += 1;
    }
    this.flushGroup();
  }

  /** 结算开口的末轮并出产视图（幂等：下一帧 extend 后可再次 finish） */
  finish(): { turns: Turn[]; orphanAnnotations: AnnotationCarrier[] } {
    if (this.turn && this.currentSettlement) {
      this.settleTurn(this.turn, this.currentSettlement);
      this.spans[this.spans.length - 1].end = this.consumed;
    }
    return { turns: this.turns, orphanAnnotations: this.orphanAnnotations };
  }

  /** 回退到「已消费 <= target」的最后一个检查点（重建起点）；无可回退点时整体重置。
   *  返回实际恢复到的消费位置（调用方从 chain 的该下标续跑）。 */
  restoreTo(target: number): number {
    let index = -1;
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      if (this.checkpoints[i].consumed <= target) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      this.turns.length = 0;
      this.orphanAnnotations.length = 0;
      this.spans.length = 0;
      this.checkpoints.length = 0;
      this.namedSeen.clear();
      this.turn = undefined;
      this.currentSettlement = undefined;
      this.group = undefined;
      this.groupStartedAt = this.groupLastAt = this.groupFallbackDuration = undefined;
      this.consumed = 0;
      return 0;
    }
    const cp = this.checkpoints[index];
    this.turns.length = cp.turnsLen;
    this.orphanAnnotations.length = cp.orphanLen;
    this.spans.length = cp.turnsLen;
    this.checkpoints.length = index + 1;
    this.namedSeen = new Set(cp.namedSeen);
    this.turn = cp.turn;
    this.currentSettlement = cp.settlement ? { ...cp.settlement } : undefined;
    this.group = undefined;
    this.groupStartedAt = this.groupLastAt = this.groupFallbackDuration = undefined;
    this.consumed = cp.consumed;
    return cp.consumed;
  }
}

/** 分支链的增量延展（线性检查）：新尾部每个非 session 条目的 parent 必须等于链尾 id
 *  （权威条目与瞬态叠加都挂活动分支叶子）——中途分支点 / 挂弃枝即放弃增量。
 *  失败回 undefined（调用方全量重建）。 */
function extendChain(
  prev: ChainLink[],
  prevAbandoned: number,
  entries: SessionEntry[],
  common: number,
): { chain: ChainLink[]; abandonedCount: number } | undefined {
  const chain = prev.filter((link) => link.index < common);
  // 被截断的旧链尾只被更靠后的旧尾引用（链上条目按定义未被头部引用），头部不受影响，
  // 被弃计数不变；新尾部必须从截断点线性延长，否则（中途分支点）放弃增量
  let tailParent: string | null = chain.length > 0 ? chain[chain.length - 1].entry.id : null;
  for (let i = common; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === "session") return undefined;
    if (entry.parentId !== tailParent) return undefined;
    tailParent = entry.id;
    chain.push({ index: i, entry });
  }
  return { chain, abandonedCount: prevAbandoned };
}

function commonPrefixLength(a: readonly SessionEntry[], b: readonly SessionEntry[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/** liveTools 的内容同值比较（引用换而内容同 → 折叠为缓存值，不作失效） */
function sameLiveTools(a: LiveTools | undefined, b: LiveTools | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => {
    const x = a[key];
    const y = b[key];
    return x.outputTail === y.outputTail && x.totalLen === y.totalLen;
  });
}

/** draft 元数据的内容同值比较（只含 entryId 与 thinkingComplete 两个判据） */
function sameDraft(a: DraftThinking | undefined, b: DraftThinking | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.entryId === b.entryId && (a.thinkingComplete ?? false) === (b.thinkingComplete ?? false);
}

/** 预扫一批链条目进表（追加式；旧尾残留键无害——id 全局唯一） */
function prescan(tables: PrescanTables, chain: readonly ChainLink[], from: number): void {
  for (let i = from; i < chain.length; i++) {
    const entry = chain[i].entry;
    if (entry.type !== "message") continue;
    const message = (entry as MessageEntry).message;
    if (message.role === "toolResult") {
      const result = message as ToolResultMessage;
      tables.results.set(result.toolCallId, result);
    } else if (message.role === "assistant") {
      for (const block of (message as AssistantMessage).content) {
        if (block.type === "toolCall") tables.callIds.add(block.id);
      }
    }
  }
}

/** 活动分支上最后一次模型声明（Composer 徽标）：只扫 [from, …) 段、后者覆盖前者 */
function scanModelTail(
  entries: readonly SessionEntry[],
  from: number,
  prev?: { provider?: string; modelId?: string },
): { provider?: string; modelId?: string } | undefined {
  let found = prev;
  for (let i = from; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === "model_change") {
      const { provider, modelId } = entry as { provider?: string; modelId?: string };
      found = { provider, modelId };
    } else if (entry.type === "message") {
      const message = (entry as MessageEntry).message;
      if (message.role === "assistant") {
        const assistant = message as AssistantMessage;
        if (assistant.model) found = { provider: assistant.provider, modelId: assistant.model };
      }
    }
  }
  return found;
}

interface IncrementalCache {
  entries: SessionEntry[];
  liveTools: LiveTools | undefined;
  draft: DraftThinking | undefined;
  tables: PrescanTables;
  chain: ChainLink[];
  abandonedCount: number;
  builder: TurnsBuilder;
  lastModel: { provider?: string; modelId?: string } | undefined;
  thinkingLevel: string | undefined;
  model: TranscriptModel;
}

let cache6: IncrementalCache | undefined;

/** 全量重建：与旧实现同构的完整管线（增量判据不满足时的唯一出路） */
function fullBuild(entries: SessionEntry[], liveTools?: LiveTools, draft?: DraftThinking): IncrementalCache {
  const tables: PrescanTables = { results: new Map(), callIds: new Set() };
  const chain: ChainLink[] = [];
  const branch = buildActiveBranch(entries);
  // 链元素带原始数组下标：后续增量调用要把 raw 前缀分歧映射回链下标（id 全局唯一）
  const rawIndexOf = new Map(entries.map((entry, index) => [entry.id, index] as const));
  for (const entry of branch.entries) chain.push({ index: rawIndexOf.get(entry.id) ?? -1, entry });
  prescan(tables, chain, 0);
  const builder = new TurnsBuilder(tables);
  builder.extend(branch.entries, liveTools, draft);
  const { turns, orphanAnnotations } = builder.finish();
  if (turns[0] && branch.abandonedCount > 0) turns[0].abandonedCount = branch.abandonedCount;
  // 活动分支上最后一次思考等级（Composer 徽标）
  let thinkingLevel: string | undefined;
  for (const entry of branch.entries) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = (entry as { thinkingLevel?: string }).thinkingLevel;
    }
  }
  const model: TranscriptModel = {
    turns: [...turns],
    orphanAnnotations: [...orphanAnnotations],
    abandonedCount: branch.abandonedCount,
    model: lastModelOnBranch(branch.entries),
    thinkingLevel,
  };
  return {
    entries,
    liveTools,
    draft,
    tables,
    chain,
    abandonedCount: branch.abandonedCount,
    builder,
    lastModel: model.model,
    thinkingLevel,
    model,
  };
}

/**
 * 唯一派生入口：Entry 列表进，TranscriptModel 出。
 * 状态层（useSessionDetail）与视图层（Transcript）都只消费这个 interface；
 * 本函数即测试面——黄金样本断言的就是它的返回值。
 * liveTools 是运行中工具的实时尾巴（ADR-0012 补记八）：驱动路径注入，Live Tail 不传。
 *
 * C6 增量缝：单槽缓存按帧判据续算——入参内容稳定（liveTools / draft 内容同值折叠）
 * 且数组为「共享前缀 + 线性尾部」时，预扫表与分支链累积复用、turns 从分歧点所在的
 * turn 起点重建（checkpoint 回退）；任一判据不满足即 fullBuild。全量与增量产出
 * 深度一致（由增量等价测试锁定），调用方无需感知。
 */
/** 流式草稿元数据（ADR-0012 补记九）：thinkingComplete 是内核 thinking_end 的定稿信号，
    只作用于调用方指认的那条草稿条目——完成思考在运行视图里即收起，不等正文开流 */
export interface DraftThinking {
  entryId: string;
  thinkingComplete?: boolean;
}

export function buildTranscriptModel(
  entries: SessionEntry[],
  liveTools?: LiveTools,
  draft?: DraftThinking,
): TranscriptModel {
  // 全等快路径：同引用重复调用（无关重渲触发的重复取值）
  if (cache6 && entries === cache6.entries && liveTools === cache6.liveTools && draft === cache6.draft) {
    return cache6.model;
  }
  // 入参内容级折叠：流式帧换引用不换内容时不作失效
  const liveStable = sameLiveTools(cache6?.liveTools, liveTools);
  const draftStable = sameDraft(cache6?.draft, draft);
  const live = liveStable && cache6 ? cache6.liveTools : liveTools;
  const draftStableValue = draftStable && cache6 ? cache6.draft : draft;

  let branch: { chain: ChainLink[]; abandonedCount: number } | undefined;
  let chainCommon = -1;
  if (cache6 && liveStable && draftStable) {
    const common = commonPrefixLength(entries, cache6.entries);
    branch = extendChain(cache6.chain, cache6.abandonedCount, entries, common);
    if (branch) {
      chainCommon = 0;
      while (
        chainCommon < cache6.chain.length &&
        chainCommon < branch.chain.length &&
        cache6.chain[chainCommon].entry === branch.chain[chainCommon].entry
      ) {
        chainCommon += 1;
      }
    }
  }

  if (!branch) {
    cache6 = fullBuild(entries, live, draftStableValue);
    return cache6.model;
  }

  // 局部绑定收窄：模块级 let 的引用会被函数调用打断，后续以 cache 读写
  const cache = cache6 as IncrementalCache;
  // 预扫增量：从链分歧点续扫（旧尾残留键无害——条目 id 全局唯一永不复用）
  prescan(cache.tables, branch.chain, chainCommon);
  // turns 重建点：第一个覆盖分歧点的 turn 的起点（checkpoint 回退到它之前）
  const spans = cache.builder.spans;
  let rebuildFrom = chainCommon;
  for (const span of spans) {
    if (span.end > chainCommon) {
      rebuildFrom = span.start;
      break;
    }
  }
  const consumed = cache.builder.restoreTo(rebuildFrom);
  cache.builder.extend(
    branch.chain.slice(consumed).map((link) => link.entry),
    live,
    draftStableValue,
  );

  // 最后声明扫描：从链分歧点续扫（后者覆盖前者，与整链倒序扫描同结果）
  const lastModel = scanModelTail(
    branch.chain.map((link) => link.entry),
    chainCommon,
    cache.lastModel,
  );
  let thinkingLevel = cache.thinkingLevel;
  for (let i = chainCommon; i < branch.chain.length; i++) {
    const entry = branch.chain[i].entry;
    if (entry.type === "thinking_level_change") {
      thinkingLevel = (entry as { thinkingLevel?: string }).thinkingLevel;
    }
  }

  const { turns, orphanAnnotations } = cache.builder.finish();
  if (turns[0] && branch.abandonedCount > 0) turns[0].abandonedCount = branch.abandonedCount;
  const model: TranscriptModel = {
    turns: [...turns],
    orphanAnnotations: [...orphanAnnotations],
    abandonedCount: branch.abandonedCount,
    model: lastModel,
    thinkingLevel,
  };
  cache.entries = entries;
  cache.liveTools = live;
  cache.draft = draftStableValue;
  cache.chain = branch.chain;
  cache.abandonedCount = branch.abandonedCount;
  cache.lastModel = lastModel;
  cache.thinkingLevel = thinkingLevel;
  cache.model = model;
  return model;
}

// ---------- TranscriptModel：唯一出口 ----------

/** Transcript 渲染所需的完整派生数据（GLOSSARY「TranscriptModel」）；Entry 树不暴露 */
export interface TranscriptModel {
  /** 活动分支切出的 Turn 列表（ADR-0006） */
  turns: Turn[];
  /** 首条 user 消息之前的注解（罕见；归一显示形状，C5） */
  orphanAnnotations: AnnotationCarrier[];
  /** 未落在活动分支上的条目数（Session Bar branched 徽标） */
  abandonedCount: number;
  /** 活动分支上最后一次模型声明（Composer 徽标） */
  model?: { provider?: string; modelId?: string };
  /** 活动分支上最后一次 thinking_level_change（Composer 徽标） */
  thinkingLevel?: string;
}

/** 钻取选择子（C5）：第 turnIndex 轮的第 groupIndex 个过程组，不存在回 undefined——
 *  测试与调用方不再各自深挖嵌套（此前测试里 kind 判别钻取 19 处、取数 helper 三份互不共享） */
export function turnGroupAt(
  model: TranscriptModel,
  turnIndex: number,
  groupIndex: number,
): GroupTurnItem | undefined {
  let seen = -1;
  const turn = model.turns[turnIndex];
  if (!turn) return undefined;
  for (const item of turn.items) {
    if (item.kind !== "group") continue;
    seen += 1;
    if (seen === groupIndex) return item;
  }
  return undefined;
}

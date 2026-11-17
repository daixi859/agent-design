/**
 * pi session JSONL 的结构类型（v3）。
 * 与 pi 内核 JSONL 契约显式对齐（wire 契约的镜像建模，字段按上游定义收窄），
 * 对未知字段宽容（catch-all 分支）；上游权威定义见
 * packages/coding-agent/src/core/session-manager.ts（上游仓库 earendil-works/pi）。
 * 口径说明：不再局限于「UI 当前用到的字段」——驱动协议整行透传 Entry（ADR-0012），
 * 客户端之外（导出、调试、未来视图）同读这份契约；但可选性以「宽容解析」为先，
 * 上游必填字段在本侧收窄为可选不算失真。
 */

// ---------- 内容块 ----------

export interface TextBlock {
  type: "text";
  text: string;
  /** OpenAI Responses 等的消息元数据（上游 TextContent.textSignature） */
  textSignature?: string;
}

export interface ImageBlock {
  type: "image";
  /** base64 编码的图像数据 */
  data?: string;
  mimeType?: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  /** 供应商加密的推理回放数据；redacted 时为不透明载荷（上游 ThinkingContent.thinkingSignature） */
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  /** Google 专用：复用 thought 上下文的不透明签名（上游 ToolCall.thoughtSignature） */
  thoughtSignature?: string;
  /** OpenAI Responses 命名空间下的动态/带前缀工具（上游 ToolCall.namespace） */
  namespace?: string;
  /** 参数文本不是合法 JSON 对象时的问题描述；此时 arguments 为 {}（上游 ToolCall.argumentsError） */
  argumentsError?: string;
}

export type ContentBlock = TextBlock | ImageBlock | ThinkingBlock | ToolCallBlock;

// ---------- 消息 ----------

export interface UsageInfo {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** cacheWrite 中按 1h 保留期写入的部分；仅 Anthropic 上报（上游 Usage.cacheWrite1h） */
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
    /** true 表示 total 是供应商账单价；false/缺省为目录估算（上游 cost.totalFromProvider） */
    totalFromProvider?: boolean;
  };
}

export type StopReason =
  | "pending"
  | "stop"
  | "length"
  | "toolUse"
  | "error"
  | "aborted"
  | "deferred";

export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
  timestamp?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
  provider?: string;
  model?: string;
  /** 供应商实际回报的模型 id，可能与请求的 model 不同（上游 responseModel） */
  responseModel?: string;
  /** 本次响应用到的 thinking 级别（上游 thinkingLevel） */
  thinkingLevel?: string;
  usage?: UsageInfo;
  stopReason?: StopReason;
  errorMessage?: string;
  /** 请求开始到响应结束的单调耗时（上游 durationMs） */
  durationMs?: number;
  timestamp?: number;
}

/** 工具在执行中对其他工具的调用记录（上游 NestedToolCalls；结果不记录，只记调用） */
export interface NestedToolCalls {
  calls: Array<{
    id: string;
    name: string;
    /** 超限时省略并以 argumentsBytes 代替 */
    arguments?: Record<string, unknown>;
    argumentsBytes?: number;
    status: "ok" | "error" | "unfinished";
    durationMs?: number;
    /** 截断后的错误文本 */
    error?: string;
  }>;
  /** false 表示有调用/参数被丢弃或未完成 */
  complete: boolean;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ContentBlock[];
  /** 工具相关的结构化附加信息（如 edit 的 diff） */
  details?: unknown;
  /** 工具自身执行的用量；不计入主上下文（上游 ToolResultMessage.usage） */
  usage?: UsageInfo;
  nestedCalls?: NestedToolCalls;
  isError?: boolean;
  /** 工具执行的单调耗时（上游 durationMs） */
  durationMs?: number;
  timestamp?: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  /** 截断时完整输出的落盘路径（上游 fullOutputPath） */
  fullOutputPath?: string;
  /** true 表示被排除在 LLM 上下文外（!! 前缀，上游 excludeFromContext） */
  excludeFromContext?: boolean;
}

/** 系统提示等脚手架消息，UI 不渲染（ADR-0004 隐藏级） */
export interface SystemMessage {
  role: "system";
  content?: string;
  /** 后续 system 消息按名替换 section，null 表示删除该 section（上游 sections） */
  sections?: Record<string, string | null>;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | SystemMessage
  | { role: string; [key: string]: unknown };

// ---------- 条目（JSONL 行） ----------

export type EntryType =
  | "session"
  | "message"
  | "model_change"
  | "thinking_level_change"
  | "usage"
  | "compaction"
  | "context_edit"
  | "branch_summary"
  | "custom"
  | "custom_message"
  | "label"
  | "session_info";

export interface EntryBase {
  type: EntryType;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface SessionHeaderEntry extends EntryBase {
  type: "session";
  /** v1 会话没有该字段（上游 version?: number） */
  version?: number;
  id: string;
  cwd?: string;
  parentSession?: string;
}

export interface MessageEntry extends EntryBase {
  type: "message";
  message: AgentMessage;
}

/** 内核会话快照：header + 条目列表。
 * attach 回包走它（create 出的会话尚未落盘，客户端只能靠这份快照渲染）。
 * 形状只在协议层声明一次，core / server / app 均匀引用（避免结构型 Data Clump 四处重述）。 */
export interface SessionSnapshot {
  header?: SessionHeaderEntry;
  entries: SessionEntry[];
}

/** 流式草稿：内核已生成、但尚未落盘成条目的那一段消息内容（协议 delta 帧的累积形状）。
 * 它是瞬态的（ADR-0012）：整段可由内核重发复现，帧本身可丢；
 * 渲染时临时合成一条条目挂在活动分支尾部，权威条目一落盘即整体让位。 */
export interface StreamingDraft {
  text?: string;
  thinking?: string;
  /** 思考块已定稿（内核 thinking_end 信号，ADR-0012 补记九）：思考完成即收起，不等正文 */
  thinkingComplete?: boolean;
  /** 草稿计时锚（首轮 delta 时刻，ADR-0014）：挂锚随草稿生灭，per-session 不串（原模块级单例已废） */
  anchorAt?: string;
}

export interface ModelChangeEntry extends EntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface ThinkingLevelChangeEntry extends EntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface UsageEntry extends EntryBase {
  type: "usage";
  kind?: string;
  provider?: string;
  model?: string;
  usage: UsageInfo;
  /** 用量通知的人类可读限定说明（上游 note） */
  note?: string;
}

export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  /** 扩展附加数据（ArtifactIndex、结构化压缩版本标记等） */
  details?: unknown;
  /** 生成摘要的 LLM 调用用量 */
  usage?: UsageInfo;
  /** true 表示扩展生成；缺省/false 为 pi 生成 */
  fromHook?: boolean;
  /** 压缩边界处的完整 prompt 与工具状态 */
  systemMessage?: SystemMessage;
}

export interface BranchSummaryEntry extends EntryBase {
  type: "branch_summary";
  fromId: string;
  summary?: string;
  /** 扩展附加数据（不送 LLM） */
  details?: unknown;
  /** 生成摘要的 LLM 调用用量 */
  usage?: UsageInfo;
  /** true 表示扩展生成，false 为 pi 生成 */
  fromHook?: boolean;
}

export interface SessionInfoEntry extends EntryBase {
  type: "session_info";
  name?: string;
}

/** 扩展注入、参与 LLM 上下文的消息条目（上游 CustomMessageEntry）。
 *  display:false 完全隐藏；true 以区别于 user 消息的样式渲染。 */
export interface CustomMessageEntry extends EntryBase {
  type: "custom_message";
  customType: string;
  content: string | (TextBlock | ImageBlock)[];
  details?: unknown;
  display: boolean;
}

export type SessionEntry =
  | SessionHeaderEntry
  | MessageEntry
  | ModelChangeEntry
  | ThinkingLevelChangeEntry
  | UsageEntry
  | CompactionEntry
  | BranchSummaryEntry
  | SessionInfoEntry
  | CustomMessageEntry
  | (EntryBase & { type: string; [key: string]: unknown });

// ---------- API 响应 ----------

export interface SessionSummary {
  id: string;
  file: string;
  projectPath: string;
  projectName: string;
  /** session_info 命名（可能缺失） */
  name?: string;
  /** 首条 user 消息截断（Q16） */
  title?: string;
  startedAt: string;
  /** 文件 mtime（Live Tail 的活跃依据，Q17） */
  lastActiveAt: string;
  sizeBytes: number;
  model?: string;
  provider?: string;
}

export interface SessionsResponse {
  rootExists: boolean;
  sessions: SessionSummary[];
}

export interface SessionDetail {
  file: string;
  header: SessionHeaderEntry;
  entries: SessionEntry[];
  sizeBytes: number;
  mtimeMs: number;
  /** 最后一条完整行的字节偏移，Live Tail 从这里续读（Q17） */
  offset: number;
}

export interface TailResponse {
  sizeBytes: number;
  mtimeMs: number;
  /** 下次轮询应使用的字节偏移（只推进到已完整读取的行尾，Q17） */
  offset: number;
  entries: SessionEntry[];
}


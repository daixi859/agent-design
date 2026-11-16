/**
 * pi session JSONL 的最小结构类型（v3）。
 * 只建模 UI 需要的字段，对未知字段宽容；与 pi 内核类型对齐见
 * packages/coding-agent/src/core/session-manager.ts（上游仓库 earendil-works/pi）。
 */

// ---------- 内容块 ----------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  /** base64 */
  data?: string;
  mimeType?: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  redacted?: boolean;
}

export interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ImageBlock | ThinkingBlock | ToolCallBlock;

// ---------- 消息 ----------

export interface UsageInfo {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
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
  usage?: UsageInfo;
  stopReason?: StopReason;
  errorMessage?: string;
  timestamp?: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ContentBlock[];
  /** 工具相关的结构化附加信息（如 edit 的 diff） */
  details?: unknown;
  isError?: boolean;
  timestamp?: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
}

/** 系统提示等脚手架消息，UI 不渲染（ADR-0004 隐藏级） */
export interface SystemMessage {
  role: "system";
  content?: string;
  sections?: Record<string, string>;
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
  version: number;
  id: string;
  cwd?: string;
  parentSession?: string;
}

export interface MessageEntry extends EntryBase {
  type: "message";
  message: AgentMessage;
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
}

export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
}

export interface BranchSummaryEntry extends EntryBase {
  type: "branch_summary";
  fromId: string;
  summary?: string;
}

export interface SessionInfoEntry extends EntryBase {
  type: "session_info";
  name: string;
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


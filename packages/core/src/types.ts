// 内核接入层的窄替身边界（ADR-0012）：SessionHost 只依赖此接口，
// 单测注入最小 fake；真实现见 pi-session-source.ts（包装 pi SDK 的 AgentSession）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
  ContextUsageInfo,
  InputDisposition,
  SessionCatalog,
  StreamingBehavior,
} from "@pi-studio/shared/protocol";
import type { SessionEntry, SessionSnapshot } from "@pi-studio/shared/pi-types";

/** 排队应答与流式排队策略从协议层引（唯一真相源） */
export type { InputDisposition, StreamingBehavior };

/** 会话请求：create = 在 cwd 新建；attach = 打开已有 session 文件继续驱动 */
export type PiSessionRequest = { kind: "create"; cwd: string } | { kind: "attach"; file: string };

/** prompt 的可选行为（pi PromptOptions 的窄投影）：运行中排队策略，idle 下无作用 */
export interface PromptOptions {
  streamingBehavior?: StreamingBehavior;
}

/** 工厂由宿主注入：单测用 fake，生产见 pi-session-source.ts */
export type PiSessionFactory = (request: PiSessionRequest) => Promise<PiSessionLike>;

export interface PiSessionLike {
  readonly sessionId: string;
  /** 内核当前快照：header 在 create 后立即可用（文件尚未落盘时客户端的唯一渲染来源） */
  snapshot(): SessionSnapshot;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<InputDisposition>;
  followUp(text: string): Promise<InputDisposition>;
  abort(): Promise<void>;
  /** 模型与命令目录（ADR-0016）：attach 回包一次性下发，内核形状在此层映射为协议形状 */
  catalog(): SessionCatalog;
  /** 切换模型（仅会话级）：内核无推送事件，宿主在 resolve 后主动拉取条目 */
  setModel(provider: string, modelId: string): Promise<void>;
  /** 调整 thinking 档位（仅会话级）：内核会 clamp 到该模型的可用档位 */
  setThinkingLevel(level: string): Promise<void>;
  /** 清空两条队列（ADR-0016 整批重编第一步）；清空结果经 queue_update 事件回推 */
  clearQueue(): void;
  /** 手动压缩上下文（内核 compact()）：生命周期经 compaction 事件回推 */
  compact(): Promise<void>;
  /** 上下文用量（内核 getContextUsage 投影）：内核刚压缩完/下个回复前可能未知 */
  contextUsage(): ContextUsageInfo | undefined;
  /** 拉取自上次调用以来新增的权威条目（pi 的 entry_appended 不覆盖普通消息落盘） */
  drainNewEntries(): SessionEntry[];
  dispose(): void;
}

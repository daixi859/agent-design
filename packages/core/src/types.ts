// 内核接入层的窄替身边界（ADR-0012）：SessionHost 只依赖此接口，
// 单测注入最小 fake；真实现见 pi-session-source.ts（包装 pi SDK 的 AgentSession）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { InputDisposition, StreamingBehavior } from "@pi-studio/shared/protocol";
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
  /** 拉取自上次调用以来新增的权威条目（pi 的 entry_appended 不覆盖普通消息落盘） */
  drainNewEntries(): SessionEntry[];
  dispose(): void;
}

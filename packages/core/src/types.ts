// 内核接入层的窄替身边界（ADR-0012）：SessionHost 只依赖此接口，
// 单测注入最小 fake；真实现见 pi-session-source.ts（包装 pi SDK 的 AgentSession）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** 排队应答：= pi 的 QueuedInputDisposition（该型未从包根导出，字面量对齐） */
export type InputDisposition = "queued" | "handled";

/** 会话请求：create = 在 cwd 新建；attach = 打开已有 session 文件继续驱动 */
export type PiSessionRequest = { kind: "create"; cwd: string } | { kind: "attach"; file: string };

/** 工厂由宿主注入：单测用 fake，生产见 pi-session-source.ts */
export type PiSessionFactory = (request: PiSessionRequest) => Promise<PiSessionLike>;

export interface PiSessionLike {
  readonly sessionId: string;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string): Promise<void>;
  steer(text: string): Promise<InputDisposition>;
  followUp(text: string): Promise<InputDisposition>;
  abort(): Promise<void>;
  dispose(): void;
}

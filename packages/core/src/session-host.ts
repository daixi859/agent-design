// SessionHost：单个被驱动 Session 的宿主（ADR-0012）。命令进、协议事件出；
// 错误一律落事件流（宿主层不必区分 WS/IPC），prompt 失败伴随回到 idle，
// steer/followUp 失败不动状态（运行中会话不受影响）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { DriveEvent, DriveStatus } from "@pi-studio/shared/protocol";
import { normalizeSessionEvent } from "./normalize.ts";
import type { InputDisposition, PiSessionLike } from "./types.ts";

export interface SessionHostOptions {
  session: PiSessionLike;
  /** 事件出口由宿主注入（server 广播、IPC 桥或测试收集器） */
  emit: (event: DriveEvent) => void;
}

export class SessionHost {
  readonly sessionId: string;
  private readonly session: PiSessionLike;
  private readonly emit: (event: DriveEvent) => void;
  private readonly unsubscribe: () => void;
  private currentStatus: DriveStatus = "idle";

  constructor(options: SessionHostOptions) {
    this.session = options.session;
    this.emit = options.emit;
    this.sessionId = options.session.sessionId;
    this.unsubscribe = this.session.subscribe((event) => this.handle(event));
  }

  get status(): DriveStatus {
    return this.currentStatus;
  }

  /** 发起一轮对话；resolve 即本轮结束，被拒时落 error + 回到 idle */
  prompt(text: string): Promise<void> {
    return this.session.prompt(text).catch((err: unknown) => {
      this.fail(err);
      this.setStatus("idle");
    });
  }

  /** 运行中插话：当前 assistant 轮结束后、下次模型调用前送达 */
  steer(text: string): Promise<InputDisposition | "failed"> {
    return this.session.steer(text).catch((err: unknown) => {
      this.fail(err);
      return "failed" as const;
    });
  }

  /** 追问：本轮运行彻底结束后送达 */
  followUp(text: string): Promise<InputDisposition | "failed"> {
    return this.session.followUp(text).catch((err: unknown) => {
      this.fail(err);
      return "failed" as const;
    });
  }

  /** 中止当前运行；settled(aborted) 事件随后到达 */
  abort(): Promise<void> {
    return this.session.abort().catch((err: unknown) => {
      this.fail(err);
    });
  }

  dispose(): void {
    this.unsubscribe();
    this.session.dispose();
  }

  private handle(event: AgentSessionEvent): void {
    for (const body of normalizeSessionEvent(event)) {
      if (body.type === "status") this.currentStatus = body.status;
      this.emit({ sessionId: this.sessionId, body });
    }
  }

  private setStatus(status: DriveStatus): void {
    this.currentStatus = status;
    this.emit({ sessionId: this.sessionId, body: { type: "status", status } });
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.emit({ sessionId: this.sessionId, body: { type: "error", message } });
  }
}

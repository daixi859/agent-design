// SessionHost：单个被驱动 Session 的宿主（ADR-0012）。命令进、协议事件出；
// 错误一律落事件流（宿主层不必区分 WS/IPC），prompt 失败伴随回到 idle，
// steer/followUp 失败不动状态（运行中会话不受影响）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { errorMessage } from "@pi-studio/shared/errors";
import type { DriveEvent, DriveStatus } from "@pi-studio/shared/protocol";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
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

  /** 内核当前快照：attach 回包用它补齐客户端基线（create 出的会话文件未落盘） */
  snapshot(): SessionSnapshot {
    return this.session.snapshot();
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
    // pi 只在部分路径发 entry_appended（custom / context_edit / 边界草稿），普通消息落盘不发；
    // 因此在这些边界主动拉取权威条目，补齐消息与工具结果（ADR-0012 条目为中心）。
    //
    // 为什么是这几个点：pi 的 message_end 监听器先于持久化被调用（列表先看到、条目后落盘），
    // 所以「某个消息已落盘」最早在下一个 message_start 才可观测——用户消息就在此刻首次回显；
    // 否则整轮生成期间用户看到的是一动不动的旧画面（实测白屏约 6.8 秒）。
    // 每轮拉取次数与轮内的助手消息数同阶，不是每帧拉取。
    if (
      event.type === "message_start" ||
      event.type === "message_end" ||
      event.type === "turn_end" ||
      event.type === "agent_settled"
    ) {
      this.flushEntries();
    }
  }

  /** 把内核新落盘的条目逐一推给客户端（按 id 幂等，可重复推送） */
  private flushEntries(): void {
    for (const entry of this.session.drainNewEntries()) {
      this.emit({ sessionId: this.sessionId, body: { type: "entry", entry } });
    }
  }

  private setStatus(status: DriveStatus): void {
    this.currentStatus = status;
    this.emit({ sessionId: this.sessionId, body: { type: "status", status } });
  }

  private fail(err: unknown): void {
    this.emit({ sessionId: this.sessionId, body: { type: "error", message: errorMessage(err) } });
  }
}

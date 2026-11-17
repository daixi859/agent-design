// SessionHost：单个被驱动 Session 的宿主（ADR-0012）。命令进、协议事件出；
// 错误一律落事件流（宿主层不必区分 WS/IPC），prompt 失败伴随回到 idle，
// steer/followUp 失败不动状态（运行中会话不受影响）。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { errorMessage } from "@pi-studio/shared/errors";
import type { ContextUsageInfo, DriveEvent, DriveStatus, SessionCatalog } from "@pi-studio/shared/protocol";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import { normalizeSessionEvent } from "./normalize.ts";
import type { InputDisposition, PiSessionLike, PromptOptions } from "./types.ts";

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

  /** 发起一轮对话；resolve 即本轮结束，被拒时落 error + 回到 idle。
   *  streamingBehavior 透传内核：运行中到达的 prompt 转排队而非 throw（窗口竞态兜底）。 */
  prompt(text: string, options?: PromptOptions): Promise<void> {
    return this.session.prompt(text, options).catch((err: unknown) => {
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

  /** 模型与命令目录（ADR-0016）：attach 回包用；失败落事件流、回空目录 */
  catalog(): SessionCatalog {
    try {
      return this.session.catalog();
    } catch (err) {
      this.fail(err);
      return {};
    }
  }

  /** 用量快照（ADR-0016）：随 attached 帧走——宿主构造期无订阅者，事件发即丢。
   *  此后的刷新走条目边界的 usage 事件（handle 内）。 */
  usage(): ContextUsageInfo | undefined {
    return this.session.contextUsage();
  }

  /** 切换模型（ADR-0016）：resolve 后主动拉条目——内核只落 model_change entry、
   *  不发 session 事件，不 drain 则 UI 要等下一轮边界才能看到新模型 */
  async setModel(provider: string, modelId: string): Promise<void> {
    await this.session.setModel(provider, modelId);
    this.flushEntries();
  }

  /** 调整 thinking 档位（ADR-0016）：内核有 thinking_level_changed 事件（宿主已在该
   *  边界 drain），这里再 drain 一次是幂等的（条目按计数水位，无新条目零开销） */
  async setThinkingLevel(level: string): Promise<void> {
    await this.session.setThinkingLevel(level);
    this.flushEntries();
  }

  /** 清空两条队列（ADR-0016 整批重编第一步）：清空结果经内核 queue_update 回推 */
  clearQueue(): void {
    try {
      this.session.clearQueue();
    } catch (err) {
      this.fail(err);
    }
  }

  /** 手动压缩上下文（ADR-0016）：生命周期经 compaction 事件回推；被拒落 error 事件 */
  compact(): Promise<void> {
    return this.session.compact().catch((err: unknown) => {
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
    // session_info_changed / thinking_level_changed 同理：改名 / 调级落盘不发 entry_appended，
    // 不拉取则要等下一轮 message_start 才可见。每轮拉取次数与轮内事件数同阶，不是每帧拉取。
    if (
      event.type === "message_start" ||
      event.type === "message_end" ||
      event.type === "turn_end" ||
      event.type === "agent_settled" ||
      event.type === "session_info_changed" ||
      event.type === "thinking_level_changed"
    ) {
      this.flushEntries();
      // 用量与条目同边界推送（ADR-0016）：内核 getContextUsage 是拉取式 API，
      // 在这些点上值刚被最新回复/压缩刷新；Context Ring 无事件可订，靠快照自愈
      const usage = this.usage();
      if (usage) this.emit({ sessionId: this.sessionId, body: { type: "usage", usage } });
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

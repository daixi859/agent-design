// 驱动协议（ADR-0012）：web 走 WS、desktop 走 IPC，两端实现同一套 Command/Event。
// Event 以条目为中心：`entry` 与 JSONL 行同构（shared/pi-types），客户端汇入同一
// buildTranscriptModel 出口；`delta` / `status` 是瞬态信息，不落盘、可丢。
import type { SessionEntry } from "./pi-types";

/** 运行状态：由 agent_start / agent_settled / auto_retry 驱动的权威生命周期 */
export type DriveStatus = "idle" | "running" | "retrying";

/** 客户端 → 内核命令体（sessionId 在信封上，WS 按其多路复用） */
export type DriveCommandBody =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "abort" };

/** 领域层命令（core SessionHost 与 WS 帧共用） */
export interface DriveCommand {
  sessionId: string;
  body: DriveCommandBody;
}

/** 内核 → 客户端事件体 */
export type DriveEventBody =
  /** 权威条目：与落盘 JSONL 行同构，追加进客户端条目树 */
  | { type: "entry"; entry: SessionEntry }
  /** 瞬态流式增量（打字机效果），用完即弃 */
  | { type: "delta"; field: "text" | "thinking"; delta: string }
  | {
      type: "status";
      status: DriveStatus;
      /** 仅 idle 携带：本轮是否被 abort */
      aborted?: boolean;
      /** 仅 retrying 携带：第几次自动重试 */
      attempt?: number;
      /** 仅 retrying 携带：重试原因 */
      detail?: string;
    }
  /** 命令层错误（prompt 被拒、模型/凭据失败等）；会伴随回到 idle */
  | { type: "error"; message: string };

export interface DriveEvent {
  sessionId: string;
  body: DriveEventBody;
}

// ===== WS 信封（阶段三）：协议比领域层多出会话生命周期管理（attach / create / release） =====

/** 客户端帧 */
export type ClientFrame =
  | { type: "attach"; file: string }
  | { type: "create"; cwd: string }
  | { type: "release"; sessionId: string }
  | { type: "drive"; command: DriveCommand };

/** 服务端帧；attach / create 被拒、坏帧、未知类型均走 error，连接不断 */
export type ServerFrame =
  | { type: "attached"; sessionId: string }
  | { type: "released"; sessionId: string }
  | { type: "commandFailed"; sessionId: string; message: string }
  /** steer / followUp 的排队应答（prompt / abort 靠事件流反馈，无应答帧） */
  | { type: "disposition"; sessionId: string; command: "steer" | "followUp"; disposition: "queued" | "handled" }
  | { type: "error"; message: string }
  | { type: "event"; event: DriveEvent };

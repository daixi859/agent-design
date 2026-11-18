// 驱动协议（ADR-0012）：web 走 WS、desktop 走 IPC，两端实现同一套 Command/Event。
// Event 以条目为中心：`entry` 与 JSONL 行同构（shared/pi-types），客户端汇入同一
// buildTranscriptModel 出口；`delta` / `status` 是瞬态信息，不落盘、可丢。
import type { SessionEntry, SessionHeaderEntry } from "./pi-types.ts";

/** 运行状态：由 agent_start / agent_settled / auto_retry 驱动的权威生命周期 */
export type DriveStatus = "idle" | "running" | "retrying";

/** 排队应答（pi 的 QueuedInputDisposition）：steer / followUp 专属，不落盘 */
export type InputDisposition = "queued" | "handled";

/** 运行中 prompt 的排队策略（pi PromptOptions.streamingBehavior）：
 *  内核正在流式时 prompt 被拒，带此字段则转为排队而非报错——
 *  兜住「客户端还以为 idle、内核已开跑」的事件广播窗口竞态 */
export type StreamingBehavior = "steer" | "followUp";

/** 服务端自造错误的机器码：客户端据此映射 i18n，避免把中文文案硬编码在服务端 */
export type DriveErrorCode =
  | "sessionAlreadyDriven"
  | "sessionConflict"
  | "sessionNotDriven"
  | "badFrame"
  | "unknownFrame";

/** 客户端 → 内核命令体（sessionId 在信封上，WS 按其多路复用） */
export type DriveCommandBody =
  | { type: "prompt"; text: string; /** 运行中被拒时的排队策略；idle 下无作用 */ streamingBehavior?: StreamingBehavior }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "abort" }
  /** 切换模型（ADR-0016）：仅会话级（落 model_change entry），不暴露持久化选项；
   *  内核无推送事件，core 在返回后主动 drain 条目 */
  | { type: "setModel"; provider: string; modelId: string }
  /** 调整 thinking 档位（ADR-0016）：档位取值来自目录中该模型的 thinkingLevels */
  | { type: "setThinkingLevel"; level: string }
  /** 清空两条队列（ADR-0016 整批重编第一步）：队列变化经既有 queue 事件回推 */
  | { type: "clearQueue" }
  /** 手动压缩上下文（内核 compact()）：生命周期经既有 compaction 事件回推 */
  | { type: "compact" };

/** 上下文用量（内核 getContextUsage 投影）：Context Ring 的数据源。
 *  tokens 为 null 表示内核暂不知（刚压缩完、下个回复前）——环退化为仅窗口已知 */
export interface ContextUsageInfo {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

// ===== 目录（ADR-0016）：随 attached 帧一次性下发，重 attach 即刷新 =====

/** thinking 档位的正典顺序（内核 ThinkingLevel 全集）：core 的目录映射与
 *  Model Seat 的档位列表共用这一份，不许两边各排各的 */
export const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** 模型目录条目：Model Seat 列表与 Context Ring 分母（contextWindow）的数据源 */
export interface ModelCatalogEntry {
  provider: string;
  /** 服务商展示名（内核 Provider.name）；缺省回落 provider id——分组头展示用 */
  providerName?: string;
  modelId: string;
  /** 展示名；缺省回落 modelId */
  name?: string;
  /** 该模型可用的 thinking 档位（内核 getAvailableThinkingLevels 口径） */
  thinkingLevels: string[];
  /** 接受图片输入（内核 Model.input 含 "image"）：Model Seat 行内能力徽标 */
  supportsImages?: boolean;
  /** 上下文窗口 token 数；内核未告知时缺省（此时环不渲染） */
  contextWindow?: number;
}

/** 模型目录 + 当前选中 */
export interface ModelCatalog {
  models: ModelCatalogEntry[];
  /** 当前选中（内核 session.model 投影）；目录为空时可缺省 */
  current?: { provider: string; modelId: string };
  /** 当前 thinking 档位 */
  thinkingLevel?: string;
}

/** Trigger Menu 命令目录条目（ADR-0016）：三类透传命令，客户端另置少量内建映射不经协议 */
export interface CommandCatalogItem {
  /** 菜单显示名 */
  name: string;
  /** 落定/提交的触发文本前缀（内核 prompt() 的解释形态）：
   *  扩展命令与 prompt 模板为 "/name"，skill 为 "/skill:name" */
  trigger: string;
  description?: string;
  /** 参数提示（prompt 模板的 argumentHint）：Command Chip 的 ghost 提示文案 */
  argumentHint?: string;
  source: "extension" | "prompt" | "skill";
}

/** 单个被驱动会话的目录包：attached 帧一次性携带 */
export interface SessionCatalog {
  model?: ModelCatalog;
  commands?: CommandCatalogItem[];
}

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
  /** 思考定稿信号（内核 thinking_end，ADR-0012 补记九）：思考块的权威闭合——
   *  此后 thinking 不再增长，正文/工具块接续。瞬态帧可丢：首个 text delta 兜底同义 */
  | { type: "thinkingEnd" }
  /** 瞬态工具调用指示：参数流式/执行期间亮起，配对的 end 或权威条目到达即灭。
   *  start 带 args，三源依次覆盖：声明期预填（toolcall_start）、参数流渐进快照
   *  （toolcall_delta，帧随流密发，ADR-0012 补记十）、执行开始完整参数
   *  （tool_execution_start），同 id 后到者为准；update 带 outputTail
   *  （tool_execution_update.partialResult 文本尾部截断 + totalLen，ADR-0012 补记八）；
   *  end 不扩（耗时从落盘 toolResult 的 durationMs 取）。瞬态帧可丢：权威内容仍以条目为准 */
  | {
      type: "toolCall";
      phase: "start" | "update" | "end";
      id: string;
      name: string;
      /** 仅 start：调用参数（声明/参数流/执行开始三源覆盖，后到者为准） */
      args?: Record<string, unknown>;
      /** 仅 update：已流出输出的文本尾部（截断推送，非数据缺损） */
      outputTail?: string;
      /** 仅 update：输出全文长度（totalLen > tail 长度 = 输出仍在增长） */
      totalLen?: number;
    }
  /** 瞬态排队快照（pi queue_update）：steer / followUp 待送达的内容全量覆盖 */
  | { type: "queue"; steering: string[]; followUp: string[] }
  /** 上下文用量快照（内核 getContextUsage，ADR-0016）：宿主在条目边界随 drain 一并推送；
   *  无事件驱动（内核是拉取式 API），瞬态可丢、下个边界自愈 */
  | { type: "usage"; usage: ContextUsageInfo }
  /** 压缩生命周期（pi compaction_start/end）：期间内核拒绝新 prompt */
  | {
      type: "compaction";
      phase: "start" | "end";
      reason?: "manual" | "threshold" | "overflow";
      /** 仅 end 携带：压缩是否被中止 */
      aborted?: boolean;
    }
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
  /** file 回带供客户端断线重连 re-attach；
   *  header / entries 为内核当前快照（create 出的会话尚未落盘，客户端只能靠它渲染）；
   *  catalog 与 usage 为模型/命令目录与用量快照（ADR-0016，attach / create 均带）——
   *  两者都随 attach 帧走：宿主构造期无订阅者，事件会丢（同补记二的时序坑） */
  | {
      type: "attached";
      sessionId: string;
      file?: string;
      header?: SessionHeaderEntry;
      entries?: SessionEntry[];
      catalog?: SessionCatalog;
      usage?: ContextUsageInfo;
    }
  | { type: "released"; sessionId: string }
  /** 命令被拒：client 据此决定撤不撤待回显（Pending Echo）。`command` 回带被拒命令类型——
   *  只有文本命令（prompt / steer / followUp）被拒才让回显让位；setModel / setThinkingLevel
   *  被拒不得抹掉随后补发的 prompt 的气泡（ADR-0012 补记十二）*/
  | { type: "commandFailed"; sessionId: string; message: string; code?: DriveErrorCode; command?: DriveCommandBody["type"] }
  /** steer / followUp 的排队应答（prompt / abort 靠事件流反馈，无应答帧） */
  | { type: "disposition"; sessionId: string; command: "steer" | "followUp"; disposition: InputDisposition }
  /** attach / create 被拒走这里：attach 失败携 `file` 回显（Send-to-Attach 按它精确兑付，
   *  ADR-0012 补记十一）；坏帧 / 未知类型等连接级错误无 file 关联 */
  | { type: "error"; message: string; code?: DriveErrorCode; file?: string }
  | { type: "event"; event: DriveEvent };

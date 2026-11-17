// pi 运行时事件 → 协议事件体的唯一映射点（ADR-0012）。
// 原则：条目为中心（entry_appended 透传）、瞬态增量只取正文与思考、
// 生命周期由 agent_start / agent_settled / auto_retry 驱动，名单外一律吞掉。
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "@pi-studio/shared/pi-types";
import type { DriveEventBody } from "@pi-studio/shared/protocol";

export function normalizeSessionEvent(event: AgentSessionEvent): DriveEventBody[] {
  switch (event.type) {
    case "entry_appended":
      // pi 运行时条目与 wire 条目同为 JSONL 契约（GLOSSARY: Entry），跨包 union 在此收敛
      return [{ type: "entry", entry: event.entry as SessionEntry }];
    case "message_update": {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") return [{ type: "delta", field: "text", delta: ae.delta }];
      if (ae.type === "thinking_delta") return [{ type: "delta", field: "thinking", delta: ae.delta }];
      // 思考定稿（ADR-0012 补记九）：thinking 块的权威闭合信号。redacted thinking
      // 无 delta 直接 start→end，客户端需容忍「无 thinking 增量先到」的 thinkingEnd
      if (ae.type === "thinking_end") return [{ type: "thinkingEnd" }];
      // 工具调用流式声明与参数增量（ADR-0012 补记十）：id/name 取自 partial 的对应
      // 内容块（与上游 json-event.ts 的 JSON 协议同一取法）——start 是亮起帧，delta
      // 的 arguments 是渐进 JSON 解析的累积快照（pi-ai StreamingJsonParser），随流
      // 重发、客户端同 id 覆盖，参数从「执行开始才可见」提前到「声明流即可见」。
      // 无已完成键时空对象由 toolCallStart 统一滤掉；形状不符则吞，绝不猜测。
      if (ae.type === "toolcall_start" || ae.type === "toolcall_delta") {
        const block = ae.partial?.content?.[ae.contentIndex];
        if (block?.type === "toolCall") {
          return [toolCallStart(block.id, block.name, block.arguments)];
        }
        return [];
      }
      // 参数定稿：工具声明的参数 JSON 流结束，先于执行开始送达完整参数；
      // 守卫沿同一「形状不符则吞」口径（类型上 toolCall 恒在，防传输畸形）
      if (ae.type === "toolcall_end") {
        const call = ae.toolCall;
        if (call?.type === "toolCall") {
          return [toolCallStart(call.id, call.name, call.arguments)];
        }
        return [];
      }
      return [];
    }
    case "tool_execution_start":
      // 执行开始（ADR-0012 补记八）：带完整参数，运行行据此显示参数摘要；
      // 与流式期的 toolcall_start 同 id 双发，客户端按 id 覆盖——执行期参数更完整
      return [toolCallStart(event.toolCallId, event.toolName, event.args)];
    case "tool_execution_update": {
      // 执行中输出（ADR-0012 补记八）：取 partialResult 文本尾部截断推送；
      // 瞬态帧可丢，权威输出仍以落盘条目为准。形状不符则吞，绝不猜测
      const output = partialOutputTail(event.partialResult);
      if (!output) return [];
      return [
        {
          type: "toolCall",
          phase: "update",
          id: event.toolCallId,
          name: event.toolName,
          outputTail: output.tail,
          totalLen: output.totalLen,
        },
      ];
    }
    case "tool_execution_end":
      // 执行结束：熄灭「调用中」指示（正常路径由它关闭；abort 等异常路径由 idle 兜底）
      return [{ type: "toolCall", phase: "end", id: event.toolCallId, name: event.toolName }];
    case "queue_update":
      // 排队快照全量覆盖：客户端不做增量合并（瞬态、可丢、下一帧自愈）
      return [{ type: "queue", steering: [...event.steering], followUp: [...event.followUp] }];
    case "compaction_start":
      return [{ type: "compaction", phase: "start", reason: event.reason }];
    case "compaction_end":
      return [
        {
          type: "compaction",
          phase: "end",
          reason: event.reason,
          ...(event.aborted ? { aborted: true } : {}),
        },
      ];
    case "agent_start":
      return [{ type: "status", status: "running" }];
    case "agent_settled":
      return event.aborted
        ? [{ type: "status", status: "idle", aborted: true }]
        : [{ type: "status", status: "idle" }];
    case "auto_retry_start":
      return [{ type: "status", status: "retrying", attempt: event.attempt, detail: event.errorMessage }];
    default:
      return [];
  }
}

/** start 帧的统一出口：参数存在且非空对象才带（流式声明期与执行开始共用） */
function toolCallStart(
  id: string,
  name: string,
  args: unknown,
): DriveEventBody {
  const record =
    args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).length > 0
      ? (args as Record<string, unknown>)
      : undefined;
  return record ? { type: "toolCall", phase: "start", id, name, args: record } : { type: "toolCall", phase: "start", id, name };
}

/** 输出尾部截断上限：运行行的流出预览不需要全文，4000 字符约一屏半 */
const OUTPUT_TAIL_MAX = 4000;

/** partialResult 的文本尾部（ADR-0012 补记八）：拼 content[] 的 text 块，
    超上限取尾部。形状不符或无文本返回 undefined——绝不猜测。 */
function partialOutputTail(partialResult: unknown): { tail: string; totalLen: number } | undefined {
  if (!partialResult || typeof partialResult !== "object") return undefined;
  const content = (partialResult as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  let text = "";
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const value = (block as { text?: unknown }).text;
      if (typeof value === "string") text += value;
    }
  }
  if (!text) return undefined;
  return text.length <= OUTPUT_TAIL_MAX
    ? { tail: text, totalLen: text.length }
    : { tail: text.slice(-OUTPUT_TAIL_MAX), totalLen: text.length };
}

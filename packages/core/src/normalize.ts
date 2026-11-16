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
      // 工具调用参数开始流式：亮起「调用中」指示。id/name 取自 partial 的对应内容块
      // （与上游 json-event.ts 的 JSON 协议同一取法）；形状不符则吞，绝不猜测。
      if (ae.type === "toolcall_start") {
        const block = ae.partial?.content?.[ae.contentIndex];
        if (block?.type === "toolCall") {
          return [{ type: "toolCall", phase: "start", id: block.id, name: block.name }];
        }
        return [];
      }
      return [];
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

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
      return [];
    }
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

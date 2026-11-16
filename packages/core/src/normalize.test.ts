/** normalize 契约：pi 运行时事件 → 协议事件体（唯一权威映射点，ADR-0012） */
import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "@pi-studio/shared/pi-types";
import { normalizeSessionEvent } from "./normalize.ts";

// —— 夹具 ——

const entry: SessionEntry = {
  type: "message",
  id: "e1",
  parentId: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  message: { role: "user", content: "你好" },
};

/** message_update 夹具：只填 normalize 关心的 assistantMessageEvent 字段，message 不参与映射 */
function msgUpdate(ae: Record<string, unknown>): AgentSessionEvent {
  return { type: "message_update", message: {}, assistantMessageEvent: ae } as unknown as AgentSessionEvent;
}

describe("normalizeSessionEvent · pi 事件到协议事件体", () => {
  it("entry_appended → entry 原样透传（条目为中心）", () => {
    expect(normalizeSessionEvent({ type: "entry_appended", entry } as unknown as AgentSessionEvent)).toEqual([
      { type: "entry", entry },
    ]);
  });

  it("text_delta → delta(text)", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "text_delta", contentIndex: 0, delta: "你" }))).toEqual([
      { type: "delta", field: "text", delta: "你" },
    ]);
  });

  it("thinking_delta → delta(thinking)", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "thinking_delta", contentIndex: 0, delta: "想" }))).toEqual([
      { type: "delta", field: "thinking", delta: "想" },
    ]);
  });

  it("其余 assistantMessageEvent（start / end / toolcall / done…）不产出", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "text_start", contentIndex: 0 }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "text_end", contentIndex: 0, content: "完" }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_delta", contentIndex: 0, delta: "{" }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "done", reason: "stop" }))).toEqual([]);
  });

  it("agent_start → running", () => {
    expect(normalizeSessionEvent({ type: "agent_start" } as AgentSessionEvent)).toEqual([
      { type: "status", status: "running" },
    ]);
  });

  it("agent_settled → idle，aborted 如实携带", () => {
    expect(normalizeSessionEvent({ type: "agent_settled", aborted: true } as AgentSessionEvent)).toEqual([
      { type: "status", status: "idle", aborted: true },
    ]);
    expect(normalizeSessionEvent({ type: "agent_settled", aborted: false } as AgentSessionEvent)).toEqual([
      { type: "status", status: "idle" },
    ]);
  });

  it("auto_retry_start → retrying + attempt/detail", () => {
    expect(
      normalizeSessionEvent({
        type: "auto_retry_start",
        attempt: 2,
        maxAttempts: 3,
        delayMs: 100,
        errorMessage: "429",
      } as AgentSessionEvent),
    ).toEqual([{ type: "status", status: "retrying", attempt: 2, detail: "429" }]);
  });

  it("透传名单外的一律吞掉（message_end / 工具执行 / queue_update）", () => {
    expect(normalizeSessionEvent({ type: "message_end", message: {} } as unknown as AgentSessionEvent)).toEqual([]);
    expect(
      normalizeSessionEvent({
        type: "tool_execution_start",
        toolCallId: "t",
        toolName: "bash",
        args: {},
      } as AgentSessionEvent),
    ).toEqual([]);
    expect(normalizeSessionEvent({ type: "queue_update", steering: [], followUp: [] } as AgentSessionEvent)).toEqual(
      [],
    );
  });
});

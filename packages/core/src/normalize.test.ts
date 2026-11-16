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

  it("其余 assistantMessageEvent（start / end / delta / done…）不产出", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "text_start", contentIndex: 0 }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "text_end", contentIndex: 0, content: "完" }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_delta", contentIndex: 0, delta: "{" }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "done", reason: "stop" }))).toEqual([]);
  });

  it("toolcall_start → toolCall(start)，id/name 取自 partial 对应内容块", () => {
    expect(
      normalizeSessionEvent(
        msgUpdate({
          type: "toolcall_start",
          contentIndex: 1,
          partial: { content: [{ type: "text", text: "hi" }, { type: "toolCall", id: "tc1", name: "bash", arguments: {} }] },
        }),
      ),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc1", name: "bash" }]);
  });

  it("toolcall_start 的 partial 形状不符时吞掉（不猜测）", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_start", contentIndex: 3, partial: { content: [] } }))).toEqual(
      [],
    );
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_start", contentIndex: 0 }))).toEqual([]);
  });

  it("tool_execution_end → toolCall(end)（熄灭「调用中」）", () => {
    expect(
      normalizeSessionEvent({
        type: "tool_execution_end",
        toolCallId: "tc1",
        toolName: "bash",
        result: {},
        isError: false,
      } as AgentSessionEvent),
    ).toEqual([{ type: "toolCall", phase: "end", id: "tc1", name: "bash" }]);
  });

  it("queue_update → queue 全量快照", () => {
    expect(
      normalizeSessionEvent({ type: "queue_update", steering: ["插话"], followUp: ["追问"] } as AgentSessionEvent),
    ).toEqual([{ type: "queue", steering: ["插话"], followUp: ["追问"] }]);
  });

  it("compaction_start / compaction_end → compaction 帧；end 的 aborted 只在 true 时携带", () => {
    expect(normalizeSessionEvent({ type: "compaction_start", reason: "threshold" } as AgentSessionEvent)).toEqual([
      { type: "compaction", phase: "start", reason: "threshold" },
    ]);
    expect(
      normalizeSessionEvent({
        type: "compaction_end",
        reason: "manual",
        result: undefined,
        aborted: false,
        willRetry: false,
      } as AgentSessionEvent),
    ).toEqual([{ type: "compaction", phase: "end", reason: "manual" }]);
    expect(
      normalizeSessionEvent({
        type: "compaction_end",
        reason: "overflow",
        result: undefined,
        aborted: true,
        willRetry: false,
      } as AgentSessionEvent),
    ).toEqual([{ type: "compaction", phase: "end", reason: "overflow", aborted: true }]);
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

  it("透传名单外的一律吞掉（message_end / 其余工具执行事件 / 生命周期杂项）", () => {
    expect(normalizeSessionEvent({ type: "message_end", message: {} } as unknown as AgentSessionEvent)).toEqual([]);
    expect(
      normalizeSessionEvent({
        type: "tool_execution_start",
        toolCallId: "t",
        toolName: "bash",
        args: {},
      } as AgentSessionEvent),
    ).toEqual([]);
    expect(normalizeSessionEvent({ type: "tool_execution_update", toolCallId: "t", toolName: "bash", args: {}, partialResult: {} } as AgentSessionEvent)).toEqual(
      [],
    );
    expect(normalizeSessionEvent({ type: "session_info_changed", name: "x" } as AgentSessionEvent)).toEqual([]);
    expect(normalizeSessionEvent({ type: "thinking_level_changed", level: "high" } as AgentSessionEvent)).toEqual([]);
  });
});

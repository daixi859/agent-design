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

  it("thinking_end → thinkingEnd（思考定稿信号，ADR-0012 补记九）", () => {
    expect(
      normalizeSessionEvent(msgUpdate({ type: "thinking_end", contentIndex: 0, content: "想完了" })),
    ).toEqual([{ type: "thinkingEnd" }]);
  });

  it("其余 assistantMessageEvent（start / end / done…）不产出", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "text_start", contentIndex: 0 }))).toEqual([]);
    expect(normalizeSessionEvent(msgUpdate({ type: "text_end", contentIndex: 0, content: "完" }))).toEqual([]);
    // 无 partial 的 toolcall_delta 形状不符吞掉（见下方形状不符用例）
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

  it("toolcall_start 参数非空时 start 帧带 args（流式声明期，ADR-0012 补记八）", () => {
    expect(
      normalizeSessionEvent(
        msgUpdate({
          type: "toolcall_start",
          contentIndex: 0,
          partial: { content: [{ type: "toolCall", id: "tc2", name: "read", arguments: { path: "/a.ts" } }] },
        }),
      ),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc2", name: "read", args: { path: "/a.ts" } }]);
  });

  it("toolcall_start 的 partial 形状不符时吞掉（不猜测）", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_start", contentIndex: 3, partial: { content: [] } }))).toEqual(
      [],
    );
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_start", contentIndex: 0 }))).toEqual([]);
  });

  it("toolcall_delta → toolCall(start) 带渐进参数快照（参数流即可见，ADR-0012 补记十）", () => {
    expect(
      normalizeSessionEvent(
        msgUpdate({
          type: "toolcall_delta",
          contentIndex: 0,
          partial: { content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: { command: "pnpm bu" } }] },
        }),
      ),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "pnpm bu" } }]);
  });

  it("toolcall_delta 快照无已完成键时不带 args（空对象沿 toolCallStart 过滤）", () => {
    expect(
      normalizeSessionEvent(
        msgUpdate({
          type: "toolcall_delta",
          contentIndex: 0,
          partial: { content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }] },
        }),
      ),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc1", name: "bash" }]);
  });

  it("toolcall_delta 的 partial 形状不符时吞掉（不猜测）", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_delta", contentIndex: 3, partial: { content: [] } }))).toEqual(
      [],
    );
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_delta", contentIndex: 0 }))).toEqual([]);
  });

  it("toolcall_end → toolCall(start) 带定稿完整参数（先于执行开始）", () => {
    expect(
      normalizeSessionEvent(
        msgUpdate({
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: { type: "toolCall", id: "tc1", name: "bash", arguments: { command: "pnpm build" } },
        }),
      ),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "pnpm build" } }]);
  });

  it("toolcall_end 的 toolCall 缺失时吞掉（形状不符，不猜测）", () => {
    expect(normalizeSessionEvent(msgUpdate({ type: "toolcall_end", contentIndex: 0 }))).toEqual([]);
  });

  it("tool_execution_start → toolCall(start) 带完整参数（ADR-0012 补记八）", () => {
    expect(
      normalizeSessionEvent({
        type: "tool_execution_start",
        toolCallId: "tc1",
        toolName: "bash",
        args: { command: "pnpm test" },
      } as AgentSessionEvent),
    ).toEqual([{ type: "toolCall", phase: "start", id: "tc1", name: "bash", args: { command: "pnpm test" } }]);
  });

  it("tool_execution_update → toolCall(update) 文本尾部截断（4000 上限）", () => {
    const frames = normalizeSessionEvent({
      type: "tool_execution_update",
      toolCallId: "tc1",
      toolName: "bash",
      args: {},
      partialResult: { content: [{ type: "text", text: "x".repeat(4100) }] },
    } as AgentSessionEvent);
    expect(frames).toEqual([
      {
        type: "toolCall",
        phase: "update",
        id: "tc1",
        name: "bash",
        outputTail: "x".repeat(4000),
        totalLen: 4100,
      },
    ]);
  });

  it("tool_execution_update 形状不符 / 无文本时吞掉（不猜测）", () => {
    expect(
      normalizeSessionEvent({
        type: "tool_execution_update",
        toolCallId: "t",
        toolName: "bash",
        args: {},
        partialResult: {},
      } as AgentSessionEvent),
    ).toEqual([]);
    expect(
      normalizeSessionEvent({
        type: "tool_execution_update",
        toolCallId: "t",
        toolName: "bash",
        args: {},
        partialResult: { content: [{ type: "text", text: "" }] },
      } as AgentSessionEvent),
    ).toEqual([]);
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

  it("透传名单外的一律吞掉（message_end / 生命周期杂项；tool_execution_* 已放行，见补记八）", () => {
    expect(normalizeSessionEvent({ type: "message_end", message: {} } as unknown as AgentSessionEvent)).toEqual([]);
    expect(normalizeSessionEvent({ type: "session_info_changed", name: "x" } as AgentSessionEvent)).toEqual([]);
    expect(normalizeSessionEvent({ type: "thinking_level_changed", level: "high" } as AgentSessionEvent)).toEqual([]);
  });
});

/** SessionHost 契约：单会话驱动语义（构造即订阅、命令转发、状态跟踪、错误落事件流） */
import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { makeHost } from "./testing/fake-session.ts";

describe("SessionHost · 单会话驱动语义", () => {
  it("构造即订阅，暴露 sessionId", () => {
    const { host, session } = makeHost();
    expect(host.sessionId).toBe("s1");
    expect(session.listener).not.toBeNull();
  });

  it("事件经 normalize 并打上 sessionId 标签，status 同步跟踪", () => {
    const { host, session, emitted } = makeHost();
    session.emitEvent({ type: "agent_start" } as AgentSessionEvent);
    expect(emitted).toEqual([{ sessionId: "s1", body: { type: "status", status: "running" } }]);
    expect(host.status).toBe("running");
  });

  it("entry 事件携带 sessionId 透传", () => {
    const { session, emitted } = makeHost();
    session.emitEvent({
      type: "entry_appended",
      entry: { type: "message", id: "e1", parentId: null, timestamp: "T0", message: { role: "user", content: "hi" } },
    } as unknown as AgentSessionEvent);
    expect(emitted).toEqual([
      {
        sessionId: "s1",
        body: {
          type: "entry",
          entry: { type: "message", id: "e1", parentId: null, timestamp: "T0", message: { role: "user", content: "hi" } },
        },
      },
    ]);
  });

  it("agent_settled 后回到 idle", () => {
    const { host, session } = makeHost();
    session.emitEvent({ type: "agent_start" } as AgentSessionEvent);
    session.emitEvent({ type: "agent_settled", aborted: false } as AgentSessionEvent);
    expect(host.status).toBe("idle");
  });

  it("prompt 转发文本；正常路径不额外产出事件", async () => {
    const { host, session, emitted } = makeHost();
    await host.prompt("hi");
    expect(session.calls).toContain("prompt:hi");
    expect(emitted).toEqual([]);
  });

  it("prompt 被拒 → error 事件 + 回到 idle", async () => {
    const { host, session, emitted } = makeHost();
    session.failPromptWith = new Error("no model");
    await host.prompt("hi");
    expect(emitted).toEqual([
      { sessionId: "s1", body: { type: "error", message: "no model" } },
      { sessionId: "s1", body: { type: "status", status: "idle" } },
    ]);
    expect(host.status).toBe("idle");
  });

  it("steer / followUp 转发并回传 disposition", async () => {
    const { host, session } = makeHost();
    expect(await host.steer("补一句")).toBe("queued");
    expect(await host.followUp("接着说")).toBe("handled");
    expect(session.calls).toContain("steer:补一句");
    expect(session.calls).toContain("followUp:接着说");
  });

  it("steer 被拒 → error 事件、状态不动（运行不受影响）、disposition 回 failed", async () => {
    const { host, session, emitted } = makeHost();
    session.emitEvent({ type: "agent_start" } as AgentSessionEvent);
    emitted.length = 0;
    session.failSteerWith = new Error("extension command");
    expect(await host.steer("/cmd")).toBe("failed");
    expect(emitted).toEqual([{ sessionId: "s1", body: { type: "error", message: "extension command" } }]);
    expect(host.status).toBe("running");
  });

  it("abort 转发", async () => {
    const { host, session } = makeHost();
    await host.abort();
    expect(session.calls).toContain("abort");
  });

  it("dispose 后不再转发事件，且释放事件源", () => {
    const { host, session, emitted } = makeHost();
    host.dispose();
    expect(session.calls).toContain("dispose");
    expect(session.listener).toBeNull();
    session.emitEvent({ type: "agent_start" } as AgentSessionEvent);
    expect(emitted).toEqual([]);
  });
});

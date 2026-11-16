// 测试夹具：最小 PiSessionLike fake（不 import pi SDK 运行时），脚本化应答与事件注入
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { DriveEvent } from "@pi-studio/shared/protocol";
import { SessionHost } from "../session-host.ts";
import type { InputDisposition, PiSessionLike } from "../types.ts";

export class FakeSession implements PiSessionLike {
  readonly sessionId: string;
  listener: ((event: AgentSessionEvent) => void) | null = null;
  calls: string[] = [];
  failPromptWith: Error | null = null;
  failSteerWith: Error | null = null;

  constructor(id = "s1") {
    this.sessionId = id;
  }

  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emitEvent(event: AgentSessionEvent): void {
    this.listener?.(event);
  }

  prompt(text: string): Promise<void> {
    this.calls.push(`prompt:${text}`);
    return this.failPromptWith ? Promise.reject(this.failPromptWith) : Promise.resolve();
  }

  steer(text: string): Promise<InputDisposition> {
    this.calls.push(`steer:${text}`);
    return this.failSteerWith ? Promise.reject(this.failSteerWith) : Promise.resolve("queued");
  }

  followUp(text: string): Promise<InputDisposition> {
    this.calls.push(`followUp:${text}`);
    return Promise.resolve("handled");
  }

  abort(): Promise<void> {
    this.calls.push("abort");
    return Promise.resolve();
  }

  /** 脚本化：snapshot 返回的基线（attach 回包用） */
  snap: SessionSnapshot = { entries: [] };

  snapshot() {
    return this.snap;
  }

  /** 脚本化：下一次 drainNewEntries 吐出的条目 */
  pendingEntries: SessionEntry[] = [];

  drainNewEntries(): SessionEntry[] {
    const fresh = this.pendingEntries;
    this.pendingEntries = [];
    this.calls.push(`drain:${fresh.length}`);
    return fresh;
  }

  dispose(): void {
    this.calls.push("dispose");
  }
}

export function makeHost(session = new FakeSession()) {
  const emitted: DriveEvent[] = [];
  const host = new SessionHost({ session, emit: (event) => emitted.push(event) });
  return { host, session, emitted };
}

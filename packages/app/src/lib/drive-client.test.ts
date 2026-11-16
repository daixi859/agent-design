/** drive-client 纯逻辑契约：ServerFrame 入 → 客户端状态出；
    条目幂等合并（REST 全量 × WS 事件流归并的数据基础，ADR-0012 断线恢复） */
import { describe, expect, it } from "vitest";
import type { SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type { DriveEvent, ServerFrame } from "@pi-studio/shared/protocol";
import { applyServerFrame, mergeEntries, type DriveSession } from "./drive-client";

const entry = (id: string): SessionEntry => ({
  type: "message",
  id,
  parentId: null,
  timestamp: "T0",
  message: { role: "user", content: `内容 ${id}` },
});

const event = (body: DriveEvent["body"]): ServerFrame => ({ type: "event", event: { sessionId: "s1", body } });

const header: SessionHeaderEntry = { type: "session", version: 3, id: "s1", parentId: null, timestamp: "T0", cwd: "/p" };
const attached: ServerFrame = { type: "attached", sessionId: "s1", file: "f1.jsonl", header, entries: [] };
// attach 路径不带快照（快照只随 create 下发，ADR-0012 补记二）
const attachedBare: ServerFrame = { type: "attached", sessionId: "s1", file: "f1.jsonl" };

describe("mergeEntries · 双源幂等归并", () => {
  it("按 id 去重、先见顺序保留（REST 全量在前，驱动增量在后）", () => {
    const rest = [entry("e1"), entry("e2")];
    const live = [entry("e2"), entry("e3")];
    expect(mergeEntries(rest, live)).toEqual([entry("e1"), entry("e2"), entry("e3")]);
  });

  it("任一源为空时返回另一源", () => {
    expect(mergeEntries([], [entry("e1")])).toEqual([entry("e1")]);
    expect(mergeEntries([entry("e1")], [])).toEqual([entry("e1")]);
  });
});

describe("applyServerFrame · 帧到客户端状态", () => {
  // 回归点：attach 路径不带快照时，首个 attached 帧仍必须登记 session——
  // 否则驱动表里没有它，Composer 永远禁用（attach 已有会话的默认路径）
  it("无快照的 attached 也登记 session（attach 路径，非 create）", () => {
    const state = applyServerFrame(undefined, attachedBare);
    expect(state).toBeDefined();
    expect(state!.status).toBe("idle");
    expect(state!.entries).toEqual([]);
    expect(state!.header).toBeUndefined();
  });

  it("无快照的 attached 重放仍幂等（不新建对象）", () => {
    const first = applyServerFrame(undefined, attachedBare);
    expect(applyServerFrame(first, attachedBare)).toBe(first);
  });

  it("attached → 建 idle 空态；重复 attached 幂等保留已有条目", () => {
    const created = applyServerFrame(undefined, attached);
    expect(created).toEqual({ sessionId: "s1", status: "idle", entries: [], header });

    const withEntry = applyServerFrame(created, event({ type: "entry", entry: entry("e1") }));
    expect(applyServerFrame(withEntry, attached)).toBe(withEntry);
  });

  it("entry 事件：追加新条目；重复 id 幂等跳过", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e1") }));
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e2") }));
    expect(state?.entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    const before = state;
    state = applyServerFrame(state, event({ type: "entry", entry: entry("e2") }));
    expect(state).toBe(before);
  });

  it("status 事件：更新运行状态", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "status", status: "running" }));
    expect(state?.status).toBe("running");
    state = applyServerFrame(state, event({ type: "status", status: "idle", aborted: true }));
    expect(state?.status).toBe("idle");
  });

  it("error 事件与 commandFailed：lastError 更新", () => {
    let state = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, event({ type: "error", message: "模型失败" }));
    expect(state?.lastError).toBe("模型失败");
    state = applyServerFrame(state, { type: "commandFailed", sessionId: "s1", message: "steer 被拒" });
    expect(state?.lastError).toBe("steer 被拒");
  });

  it("disposition：瞬态信息不入状态（引用不变）", () => {
    let state: DriveSession | undefined = applyServerFrame(undefined, attached);
    const before = state;
    state = applyServerFrame(state, {
      type: "disposition",
      sessionId: "s1",
      command: "steer",
      disposition: "queued",
    });
    expect(state).toBe(before);
  });

  it("released → 状态移除（undefined）", () => {
    let state: DriveSession | undefined = applyServerFrame(undefined, attached);
    state = applyServerFrame(state, { type: "released", sessionId: "s1" });
    expect(state).toBeUndefined();
  });

  it("未 attach 先收到事件：防御性忽略", () => {
    expect(applyServerFrame(undefined, event({ type: "status", status: "running" }))).toBeUndefined();
  });
});

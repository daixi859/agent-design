/** SessionTail 黄金序列：初建 / 空 tail / 追加 / 连续追加 / 引用稳定性。
    契约不变量：entries append-only、offset 单调、视图只在追新时重算。 */
import { describe, expect, it } from "vitest";
import type { SessionDetail, SessionEntry, TailResponse } from "@pi-studio/shared/pi-types";
import { createSessionTail } from "./session-tail";

const TS = "2026-01-01T00:00:00.000Z";

function userEntry(id: string, parentId: string | null, text = "hello"): SessionEntry {
  return { type: "message", id, parentId, timestamp: TS, message: { role: "user", content: text } };
}

function assistantText(id: string, parentId: string | null, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TS,
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

const header = {
  type: "session",
  id: "s1",
  parentId: null,
  timestamp: TS,
  version: 3,
} as const;

function detail(entries: SessionEntry[], offset = 128): SessionDetail {
  return { file: "f.jsonl", header, entries, sizeBytes: 1024, mtimeMs: 0, offset };
}

function tailResponse(entries: SessionEntry[], offset: number): TailResponse {
  return { entries, offset, sizeBytes: 1024, mtimeMs: 0 };
}

describe("createSessionTail · 追新状态机", () => {
  it("初建：view 即全量派生，offset 取 detail.offset", () => {
    const tail = createSessionTail(detail([userEntry("u1", null)]));
    expect(tail.view.turns).toHaveLength(1);
    expect(tail.view.turns[0].id).toBe("u1");
    expect(tail.offset).toBe(128);
  });

  it("空 tail：apply 返回 false，view 引用不变，offset 仍推进", () => {
    const tail = createSessionTail(detail([userEntry("u1", null)]));
    const before = tail.view;
    const changed = tail.apply(tailResponse([], 256));
    expect(changed).toBe(false);
    expect(tail.view).toBe(before);
    expect(tail.offset).toBe(256);
  });

  it("追加：apply 返回 true，view 重算出新增 Turn", () => {
    const tail = createSessionTail(detail([userEntry("u1", null)]));
    const changed = tail.apply(
      tailResponse([assistantText("a1", "u1", "hi"), userEntry("u2", "a1")], 384),
    );
    expect(changed).toBe(true);
    expect(tail.view.turns.map((turn) => turn.id)).toEqual(["u1", "u2"]);
    expect(tail.offset).toBe(384);
  });

  it("连续追加：entries 只增，多轮序列逐一出现", () => {
    const tail = createSessionTail(detail([userEntry("u1", null)]));
    tail.apply(tailResponse([assistantText("a1", "u1", "first")], 200));
    tail.apply(tailResponse([userEntry("u2", "a1")], 300));
    tail.apply(tailResponse([assistantText("a2", "u2", "second")], 400));
    expect(tail.view.turns).toHaveLength(2);
    expect(tail.view.turns[1].items.map((item) => item.kind)).toEqual(["text"]);
    expect(tail.offset).toBe(400);
  });

  it("未追新时 view 引用稳定（跳过等价重算）", () => {
    const tail = createSessionTail(detail([userEntry("u1", null)]));
    const before = tail.view;
    tail.apply(tailResponse([], 200));
    tail.apply(tailResponse([], 300));
    expect(tail.view).toBe(before);
  });
});

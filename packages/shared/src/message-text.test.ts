/** message-text 黄金样本：形状归一 / 纯文本提取 / 标题规则（server 与客户端共用规则的测试面） */
import { describe, expect, it } from "vitest";
import type { AgentMessage, ContentBlock, SessionEntry } from "./pi-types";
import { contentBlocks, contentText, firstUserText } from "./message-text";

const TS = "2026-01-01T00:00:00.000Z";

function messageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
  return { type: "message", id, parentId, timestamp: TS, message };
}

describe("contentBlocks · 形状归一", () => {
  it("string 视为单 text 块", () => {
    expect(contentBlocks("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("数组原样返回（同一引用）", () => {
    const blocks: ContentBlock[] = [{ type: "text", text: "a" }, { type: "image", data: "x" }];
    expect(contentBlocks(blocks)).toBe(blocks);
  });
});

describe("contentText · 纯文本提取", () => {
  it("text 块按换行拼接，非文本块跳过", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "h" },
      { type: "text", text: "a" },
      { type: "image", data: "x" },
      { type: "text", text: "b" },
    ];
    expect(contentText(blocks)).toBe("a\nb");
  });

  it("string 直接返回", () => {
    expect(contentText("raw")).toBe("raw");
  });

  it("无 text 块返回空串", () => {
    expect(contentText([{ type: "image", data: "x" }])).toBe("");
  });
});

describe("firstUserText · 标题规则", () => {
  it("取首条 user 消息，空白折叠", () => {
    const entries: SessionEntry[] = [
      { type: "session", id: "s1", parentId: null, timestamp: TS, version: 3 },
      messageEntry("m1", null, { role: "assistant", content: [{ type: "text", text: "not this" }] }),
      messageEntry("m2", "m1", { role: "user", content: "  hello\n  world  " }),
    ];
    expect(firstUserText(entries)).toBe("hello world");
  });

  it("超过 80 字符截断", () => {
    const entries: SessionEntry[] = [messageEntry("m1", null, { role: "user", content: "x".repeat(100) })];
    expect(firstUserText(entries)).toHaveLength(80);
  });

  it("空文本 user 跳过，继续找下一条", () => {
    const entries: SessionEntry[] = [
      messageEntry("m1", null, { role: "user", content: "   " }),
      messageEntry("m2", "m1", { role: "user", content: [{ type: "image", data: "x" }] }),
      messageEntry("m3", "m2", { role: "user", content: "real" }),
    ];
    expect(firstUserText(entries)).toBe("real");
  });

  it("无 user 消息返回 undefined", () => {
    const entries: SessionEntry[] = [
      messageEntry("m1", null, { role: "assistant", content: [{ type: "text", text: "hi" }] }),
    ];
    expect(firstUserText(entries)).toBeUndefined();
    expect(firstUserText([])).toBeUndefined();
  });
});

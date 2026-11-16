/** Live Tail 契约的 server 半边：完整行裁切的锁定测试（纯函数，无 fs 夹具）。 */
import { describe, expect, it } from "vitest";
import { consumeCompleteLines } from "./pi-data";

const TS = "2026-01-01T00:00:00.000Z";

const modelChangeLine = JSON.stringify({
  type: "model_change",
  id: "mc1",
  parentId: null,
  timestamp: TS,
  provider: "anthropic",
  modelId: "claude",
});

const userLine = JSON.stringify({
  type: "message",
  id: "u1",
  parentId: "mc1",
  timestamp: TS,
  message: { role: "user", content: "你好，世界" },
});

describe("consumeCompleteLines · 完整行裁切契约", () => {
  it("只消费完整行，末尾半行留给下轮", () => {
    const halfLine = userLine.slice(0, userLine.length - 8); // 人为截断
    const consumed = consumeCompleteLines(`${modelChangeLine}\n${halfLine}`);
    expect(consumed).toBeDefined();
    expect(consumed!.entries).toHaveLength(1);
    expect(consumed!.entries[0].type).toBe("model_change");
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${modelChangeLine}\n`));
    expect(consumed!.text.endsWith("\n")).toBe(true);
  });

  it("块内无换行返回 undefined（半行不产出条目）", () => {
    expect(consumeCompleteLines(userLine.slice(0, 20))).toBeUndefined();
    expect(consumeCompleteLines("")).toBeUndefined();
  });

  it("多行全消费：条目按行序、consumedBytes 覆盖全部完整行", () => {
    const consumed = consumeCompleteLines(`${modelChangeLine}\n${userLine}\n`);
    expect(consumed!.entries).toHaveLength(2);
    expect(consumed!.entries[1].type).toBe("message");
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${modelChangeLine}\n${userLine}\n`));
  });

  it("多字节 UTF-8：consumedBytes 按字节数而非字符数（偏移可续读）", () => {
    const line = JSON.stringify({
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: TS,
      message: { role: "user", content: "你好，世界" },
    });
    const consumed = consumeCompleteLines(`${line}\n`);
    // 中文内容 → 字节数大于字符数
    expect(consumed!.consumedBytes).toBeGreaterThan(`${line}\n`.length);
    expect(consumed!.consumedBytes).toBe(Buffer.byteLength(`${line}\n`));
  });

  it("坏行跳过不中断（parseEntries 容错）", () => {
    const consumed = consumeCompleteLines(`not-json\n${modelChangeLine}\n`);
    expect(consumed!.entries).toHaveLength(1);
    expect(consumed!.entries[0].type).toBe("model_change");
  });
});

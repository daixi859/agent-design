/** inflight 在途簿记契约：登记与兑付收拢一处，兑付一律取出并返回（副作用归调用方） */
import { describe, expect, it } from "vitest";
import { InflightBook } from "./inflight";

/** 测试侧票据助手：registerCreate 的 Promise 包装 */
const promise = (book: InflightBook): Promise<string> =>
  new Promise<string>((resolve, reject) => book.registerCreate(resolve, reject));

describe("懒发送（file 键）", () => {
  it("registerSend 登记后可查、可按 file 取出", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: ["第一条"] });
    expect(book.sendCount).toBe(1);
    expect(book.sendOf("f1.jsonl")?.sessionId).toBe("s1");
    expect(book.sendOf("f2.jsonl")).toBeUndefined();
  });

  it("appendSend 追加文本并 merge 最新挂起选择", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: ["第一条"], choice: { provider: "p", modelId: "m" } });
    book.appendSend("f1.jsonl", "第二条", { thinkingLevel: "high" });
    const send = book.sendOf("f1.jsonl")!;
    expect(send.texts).toEqual(["第一条", "第二条"]);
    expect(send.choice).toEqual({ provider: "p", modelId: "m", thinkingLevel: "high" });
  });

  it("appendSend 无挂起选择时不覆盖既有 choice", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: ["a"], choice: { provider: "p", modelId: "m" } });
    book.appendSend("f1.jsonl", "b");
    expect(book.sendOf("f1.jsonl")?.choice).toEqual({ provider: "p", modelId: "m" });
  });

  it("fileFor 先按 file 直查、再按 sessionId 反查", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: [] });
    expect(book.fileFor("s1", "f1.jsonl")).toBe("f1.jsonl");
    expect(book.fileFor("s1", "other.jsonl")).toBe("f1.jsonl");
    expect(book.fileFor("s2")).toBeUndefined();
  });

  it("consumeSend 兑付即出账：后续 attached 重放不再补发", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: ["a"] });
    expect(book.consumeSend("f1.jsonl")?.texts).toEqual(["a"]);
    expect(book.consumeSend("f1.jsonl")).toBeUndefined();
    expect(book.sendCount).toBe(0);
  });

  it("dropAllSends 清账本并返回待撤乐观壳的 sessionId 列表", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: [] });
    book.registerSend("f2.jsonl", { sessionId: "s2", texts: [] });
    expect(book.dropAllSends().sort()).toEqual(["s1", "s2"]);
    expect(book.sendCount).toBe(0);
    expect(book.dropAllSends()).toEqual([]);
  });

  it("dropSendsForSession 只撤该会话的在途懒发送", () => {
    const book = new InflightBook();
    book.registerSend("f1.jsonl", { sessionId: "s1", texts: [] });
    book.registerSend("f2.jsonl", { sessionId: "s2", texts: [] });
    book.dropSendsForSession("s1");
    expect(book.sendOf("f1.jsonl")).toBeUndefined();
    expect(book.sendOf("f2.jsonl")).toBeDefined();
  });
});

describe("create 待定应答（FIFO）", () => {
  it("settleCreate 兑付队首并携带 attached 的 sessionId", async () => {
    const book = new InflightBook();
    const first = promise(book);
    const second = promise(book);
    book.settleCreate({ ok: true, sessionId: "s-first" });
    book.settleCreate({ ok: true, sessionId: "s-second" });
    await expect(first).resolves.toBe("s-first");
    await expect(second).resolves.toBe("s-second");
  });

  it("settleCreate 失败出账拒绝队首，后续票据不受影响", async () => {
    const book = new InflightBook();
    const first = promise(book);
    const second = promise(book);
    book.settleCreate({ ok: false, message: "新建被拒" });
    await expect(first).rejects.toThrow("新建被拒");
    book.settleCreate({ ok: true, sessionId: "s2" });
    await expect(second).resolves.toBe("s2");
  });

  it("空账本 settleCreate 静默（迟到帧）", () => {
    const book = new InflightBook();
    expect(() => book.settleCreate({ ok: true, sessionId: "s1" })).not.toThrow();
  });

  it("failAllCreates 全部拒绝并清账本", async () => {
    const book = new InflightBook();
    const first = promise(book);
    const second = promise(book);
    book.failAllCreates("驱动连接已断开");
    await expect(first).rejects.toThrow("驱动连接已断开");
    await expect(second).rejects.toThrow("驱动连接已断开");
    const third = promise(book);
    book.settleCreate({ ok: true, sessionId: "s4" });
    await expect(third).resolves.toBe("s4");
  });
});

/** SessionRegistry 契约：多 Session 并存、按 id/文件双属主标记、释放与收尾（ADR-0012） */
import { describe, expect, it } from "vitest";
import { SessionRegistry } from "./session-registry.ts";
import { FakeSession } from "./testing/fake-session.ts";
import type { PiSessionLike, PiSessionRequest } from "./types.ts";

/** 脚本化工厂：记录请求与产出的 fake 会话、按序吐出指定 id */
class FakeFactory {
  requests: PiSessionRequest[] = [];
  sessions: FakeSession[] = [];
  ids: string[] = [];
  failWith: Error | null = null;

  async open(request: PiSessionRequest): Promise<PiSessionLike> {
    this.requests.push(request);
    if (this.failWith) return Promise.reject(this.failWith);
    const id = this.ids.shift() ?? `gen-${this.requests.length}`;
    const session = new FakeSession(id);
    this.sessions.push(session);
    return session;
  }
}

function makeRegistry(ids: string[] = []) {
  const factory = new FakeFactory();
  factory.ids = ids;
  const emitted: string[] = [];
  const registry = new SessionRegistry(
    (request) => factory.open(request),
    (event) => emitted.push(`${event.sessionId}:${event.body.type}`),
  );
  return { registry, factory, emitted };
}

describe("SessionRegistry · 多会话属主与复用", () => {
  it("create：经工厂新建并按 sessionId 登记", async () => {
    const { registry, factory } = makeRegistry(["new-1"]);
    const host = await registry.create("D:/proj");
    expect(factory.requests).toEqual([{ kind: "create", cwd: "D:/proj" }]);
    expect(host.sessionId).toBe("new-1");
    expect(registry.get("new-1")).toBe(host);
    expect(registry.isDriven("new-1")).toBe(true);
  });

  it("attach：带 file 打开并做文件级标记", async () => {
    const { registry, factory } = makeRegistry(["old-1"]);
    const host = await registry.attach("D:/proj/.pi/session.jsonl");
    expect(factory.requests).toEqual([{ kind: "attach", file: "D:/proj/.pi/session.jsonl" }]);
    expect(host.sessionId).toBe("old-1");
    expect(registry.isFileDriven("D:/proj/.pi/session.jsonl")).toBe(true);
  });

  it("同一文件二次 attach 拒绝（防双写），工厂不再被调", async () => {
    const { registry, factory } = makeRegistry(["a-1"]);
    await registry.attach("f1.jsonl");
    await expect(registry.attach("f1.jsonl")).rejects.toThrow("已被驱动");
    expect(factory.requests).toHaveLength(1);
  });

  it("sessionId 冲突：第二会话立即释放且不入册", async () => {
    const { registry, factory } = makeRegistry(["dup", "dup"]);
    const first = await registry.attach("f1.jsonl");
    await expect(registry.attach("f2.jsonl")).rejects.toThrow("冲突");
    expect(factory.requests[1]).toEqual({ kind: "attach", file: "f2.jsonl" });
    expect(registry.get("dup")).toBe(first);
    expect(factory.sessions[1].calls).toContain("dispose");
  });

  it("release：释放会话并撤双标记；未知 id 静默", async () => {
    const { registry } = makeRegistry(["r-1"]);
    await registry.attach("f1.jsonl");
    registry.release("r-1");
    expect(registry.isDriven("r-1")).toBe(false);
    expect(registry.isFileDriven("f1.jsonl")).toBe(false);
    expect(registry.get("r-1")).toBeUndefined();
    expect(() => registry.release("nope")).not.toThrow();
  });

  it("disposeAll：全部释放并清空标记", async () => {
    const { registry, factory } = makeRegistry(["d-1", "d-2"]);
    await registry.attach("f1.jsonl");
    await registry.attach("f2.jsonl");
    registry.disposeAll();
    expect(registry.isDriven("d-1")).toBe(false);
    expect(registry.isFileDriven("f2.jsonl")).toBe(false);
    expect(factory.sessions[0].calls).toContain("dispose");
    expect(factory.sessions[1].calls).toContain("dispose");
  });

  it("工厂失败：错误上抛，registry 不留残册", async () => {
    const { registry, factory } = makeRegistry();
    factory.failWith = new Error("no auth");
    await expect(registry.create("D:/proj")).rejects.toThrow("no auth");
    expect(registry.isDriven("gen-1")).toBe(false);
  });
});

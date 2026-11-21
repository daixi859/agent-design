/** IPC 适配器契约（ADR-0019）：只测传输职责——通道编解码、连接生命周期、
 *  「同窗口后到者顶替」与窗口消亡释放。协议语义（租约、attach 幂等重放、drive 映射）
 *  已在 drive-control.test 逐条锁定，这里用假 ipcMain / 假窗口直接打本层，不起 Electron。 */
import { describe, expect, it } from "vitest";
import type { ClientFrame, ServerFrame } from "@pi-studio/shared/protocol";
import { CHANNEL, createIpcDriver, type IpcMainLike, type WindowLike } from "./ipc-driver.ts";
import type { DriveControlDeps, OpenedSession } from "@pi-studio/server";

// —— 测试基建 ——

/** 假 ipcMain：按通道收集监听器，测试手工投递 */
function fakeIpc() {
  const listeners = new Map<string, Set<(event: { sender: WindowLike }, ...args: unknown[]) => void>>();
  const ipc: IpcMainLike = {
    on(channel, listener) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(listener);
    },
    off(channel, listener) {
      listeners.get(channel)?.delete(listener);
    },
  };
  return {
    ipc,
    send(channel: string, sender: WindowLike, ...args: unknown[]) {
      for (const listener of listeners.get(channel) ?? []) listener({ sender }, ...args);
    },
    count(channel: string) {
      return listeners.get(channel)?.size ?? 0;
    },
  };
}

/** 假窗口：isDestroyed / send / destroyed 事件三件套 */
function fakeWindow(label: string) {
  const sent: { channel: string; args: unknown[] }[] = [];
  let destroyed = false;
  const onceHandlers: (() => void)[] = [];
  const onHandlers: Record<string, (() => void)[]> = {};
  const win: WindowLike = {
    isDestroyed: () => destroyed,
    send: (channel, ...args) => sent.push({ channel, args }),
    once: (_event, listener) => onceHandlers.push(listener),
    on: (event, listener) => {
      (onHandlers[event] ??= []).push(listener);
    },
  };
  return {
    win,
    label,
    sent,
    /** 当前连接收到的帧（已解析） */
    frames: () =>
      sent
        .filter((entry) => entry.channel === CHANNEL.inbound)
        .map((entry) => JSON.parse(String(entry.args[1])) as ServerFrame),
    closedIds: () => sent.filter((e) => e.channel === CHANNEL.closed).map((e) => String(e.args[0])),
    destroy() {
      destroyed = true;
      for (const listener of onceHandlers) listener();
    },
    crash() {
      for (const listener of onHandlers["render-process-gone"] ?? []) listener();
    },
  };
}

function fakeDeps() {
  const calls: string[] = [];
  const registrations = new Map<string, { opened: OpenedSession; file?: string; owner: object; alive: boolean }>();
  const fileOf = (file: string) => [...registrations.entries()].find(([, reg]) => reg.file === file);
  const snap = (sessionId: string): OpenedSession => ({
    sessionId,
    snapshot: () => ({
      header: { type: "session", version: 3, id: sessionId, parentId: null, timestamp: "T0", cwd: "/p" },
      entries: [],
    }),
    catalog: () => ({}),
    usage: () => undefined,
  });
  const deps: DriveControlDeps = {
    attach: async (file, owner) => {
      calls.push(`attach:${file}`);
      const opened = snap(`sid-${file}`);
      registrations.set(opened.sessionId, { opened, file, owner, alive: true });
      return opened;
    },
    create: async (cwd, owner) => {
      calls.push(`create:${cwd}`);
      const opened = snap("sid-created");
      registrations.set(opened.sessionId, { opened, owner, alive: true });
      return opened;
    },
    get: (sessionId) => registrations.get(sessionId)?.opened,
    sessionOf: (file) => fileOf(file)?.[0],
    ownerOf: (sessionId) => registrations.get(sessionId)?.owner,
    isOwnerAlive: (owner) => [...registrations.values()].some((reg) => reg.owner === owner && reg.alive),
    markAlive: (owner) => {
      for (const reg of registrations.values()) if (reg.owner === owner) reg.alive = true;
    },
    markDead: (owner) => {
      for (const reg of registrations.values()) if (reg.owner === owner) reg.alive = false;
    },
    releaseByOwner: (owner) => {
      const released: string[] = [];
      for (const [sessionId, reg] of [...registrations]) {
        if (reg.owner !== owner) continue;
        registrations.delete(sessionId);
        released.push(sessionId);
        calls.push(`release:${sessionId}`);
      }
      return released;
    },
    release: (sessionId) => {
      registrations.delete(sessionId);
      calls.push(`release:${sessionId}`);
    },
    drive: async (command) => {
      calls.push(`drive:${command.sessionId}:${command.body.type}`);
      return { ok: true };
    },
  };
  return { calls, deps };
}

/** 等到微任务清空（控制层的 receive 是故意不 await 的，帧经 promise 落地） */
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function setup() {
  const { calls, deps } = fakeDeps();
  const ipc = fakeIpc();
  const driver = createIpcDriver(deps, ipc.ipc);
  driver.listen();
  return { calls, deps, ipc, driver };
}

const attach = (file: string): ClientFrame => ({ type: "attach", file });

// —— 用例 ——

describe("ipc-driver · 通道与帧", () => {
  it("connect 后投 attach 帧 → attached 帧经 inbound 通道回到该窗口", async () => {
    const { ipc, driver } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    expect(page.frames()).toEqual([
      expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }),
    ]);
    void driver;
  });

  it("坏 JSON → badFrame 错误帧（连接不断，后续帧照常）", async () => {
    const { ipc } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", "not-json{{");
    await settle();
    expect(page.frames()[0]).toEqual({ type: "error", message: "无法解析的帧", code: "badFrame" });

    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();
    expect(page.frames()).toContainEqual(expect.objectContaining({ type: "attached" }));
  });

  it("归属校验：别的窗口拿别人的 connId 投帧一律忽略", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");
    const intruder = fakeWindow("intruder");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, intruder.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();
    expect(calls).not.toContain("attach:f1.jsonl");
    expect(intruder.frames()).toEqual([]);
  });

  it("未知 connId 的帧被静默忽略（不炸、不建连接）", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");
    ipc.send(CHANNEL.frame, page.win, "nope", JSON.stringify(attach("f1.jsonl")));
    await settle();
    expect(calls).toEqual([]);
  });

  it("disconnect 撤订阅并释放属主，之后事件不再投递", async () => {
    const { calls, ipc, driver } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    ipc.send(CHANNEL.disconnect, page.win, "c1");
    await settle();
    expect(calls).toContain("release:sid-f1.jsonl");

    const before = page.frames().length;
    driver.control.emit({ sessionId: "sid-f1.jsonl", body: { type: "status", status: "running" } });
    expect(page.frames().length).toBe(before);
  });
});

describe("ipc-driver · 连接生命周期（无心跳）", () => {
  it("同窗口后到者顶替：重载后新连接接入，旧连接名下会话先被释放", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    // 渲染进程重载：新上下文用新 connId 接入（旧上下文不会告别）
    ipc.send(CHANNEL.connect, page.win, "c2");
    await settle();
    expect(calls).toContain("release:sid-f1.jsonl");

    // 新连接照常可用（旧连接不再占着租约/会话）
    ipc.send(CHANNEL.frame, page.win, "c2", JSON.stringify(attach("f1.jsonl")));
    await settle();
    expect(calls.filter((c) => c === "attach:f1.jsonl")).toHaveLength(2);
    expect(page.frames()).toContainEqual(expect.objectContaining({ type: "attached", file: "f1.jsonl" }));

    // 旧 connId 已作废：投帧不再被受理
    const before = page.frames().length;
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify({ type: "release", sessionId: "sid-f1.jsonl" }));
    await settle();
    expect(page.frames().length).toBe(before);
  });

  it("窗口销毁释放名下会话（关窗即交还文件给 pi CLI）", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    page.destroy();
    await settle();
    expect(calls).toContain("release:sid-f1.jsonl");
  });

  it("渲染进程崩溃也释放（比窗口销毁更早）", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    page.crash();
    await settle();
    expect(calls).toContain("release:sid-f1.jsonl");
  });

  it("窗口已销毁后投帧与投递都不抛（迟到的 emit 静默丢弃）", async () => {
    const { ipc, driver } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();
    page.destroy();

    expect(() =>
      driver.control.emit({ sessionId: "sid-f1.jsonl", body: { type: "status", status: "running" } }),
    ).not.toThrow();
    expect(() => ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f2.jsonl")))).not.toThrow();
  });

  it("重复 connId 的 connect 被忽略（不会顶替自己）", async () => {
    const { calls, ipc } = setup();
    const page = fakeWindow("page");

    ipc.send(CHANNEL.connect, page.win, "c1");
    ipc.send(CHANNEL.frame, page.win, "c1", JSON.stringify(attach("f1.jsonl")));
    await settle();

    ipc.send(CHANNEL.connect, page.win, "c1");
    await settle();
    // 未被当成「后到者」顶替：会话不释放
    expect(calls).not.toContain("release:sid-f1.jsonl");
  });

  it("listen / dispose 摘挂全部三条通道", () => {
    const { calls, deps } = fakeDeps();
    const ipc = fakeIpc();
    const driver = createIpcDriver(deps, ipc.ipc);
    driver.listen();
    expect([CHANNEL.connect, CHANNEL.frame, CHANNEL.disconnect].map((c) => ipc.count(c))).toEqual([1, 1, 1]);
    driver.dispose();
    expect([CHANNEL.connect, CHANNEL.frame, CHANNEL.disconnect].map((c) => ipc.count(c))).toEqual([0, 0, 0]);
    void calls;
  });
});

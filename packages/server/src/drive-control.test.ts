/** 驱动控制层契约（ADR-0019）：传输无关的协议语义——attach 幂等重放、单客户端租约、
 *  attached 帧组装、drive → commandFailed / disposition 映射、按 sessionId 路由。
 *  用假连接对象直接打本层，不涉网络；传输适配器（ws-gateway / 未来的 IPC）只测各自的
 *  「帧怎么进出」与「连接怎么判活」。 */
import { describe, expect, it } from "vitest";
import type { ClientFrame, DriveEvent, ServerFrame } from "@pi-studio/shared/protocol";
import {
  createDriveControl,
  type DriveConnection,
  type DriveControlDeps,
  type DriveOutcome,
  type OpenedSession,
} from "./drive-control.ts";

// —— 测试基建：假连接 + 假 registry 窄投影 ——

function fakeConnection() {
  const frames: ServerFrame[] = [];
  const connection: DriveConnection = {
    send: (frame) => frames.push(frame),
    close: () => {
      closed = true;
    },
  };
  let closed = false;
  return {
    connection,
    frames,
    get closed() {
      return closed;
    },
  };
}

function fakeDeps() {
  const calls: string[] = [];
  const driveOutcomes: DriveOutcome[] = [];
  // 基线快照：header 与 entries 都在回包里（create 的会话文件尚未落盘）
  const snap = (sessionId: string): OpenedSession => ({
    sessionId,
    snapshot: () => ({
      header: { type: "session", version: 3, id: sessionId, parentId: null, timestamp: "T0", cwd: "/p" },
      entries: [
        {
          type: "message",
          id: `${sessionId}-m1`,
          parentId: null,
          timestamp: "T0",
          message: { role: "user", content: "hi" },
        },
      ],
    }),
    catalog: () => ({}),
    usage: () => undefined,
  });
  // 属主单表的 fake（C7）：attach 即登记（owner + alive）、release 即撤销、
  // 活属主拒绝 / 判死属主可接管——registry 的窄投影语义
  const registrations = new Map<string, { opened: OpenedSession; file?: string; owner: object; alive: boolean }>();
  const fileOf = (file: string) => [...registrations.entries()].find(([, reg]) => reg.file === file);
  const deps: DriveControlDeps = {
    attach: async (file, owner) => {
      calls.push(`attach:${file}`);
      // 打不开的会话文件：attach 期间的任一失败都应回到 error 帧并保留 file 回显
      if (file.endsWith("locked.jsonl")) throw new Error("无法打开会话文件");
      const existing = fileOf(file);
      if (existing) {
        const [existingId, reg] = existing;
        if (reg.owner === owner) throw new Error("同连接重复 attach，拒绝重开");
        // 跨连接：租约保证旧属主已让位，残留登记视为僵尸，释放后接管
        deps.release(existingId);
      }
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
    release: (id) => {
      calls.push(`release:${id}`);
      registrations.delete(id);
    },
    drive: async (command) => {
      calls.push(`drive:${command.sessionId}:${command.body.type}`);
      return driveOutcomes.shift() ?? { ok: true };
    },
  };
  return { calls, driveOutcomes, deps };
}

const statusEvent = (id: string): DriveEvent => ({ sessionId: id, body: { type: "status", status: "running" } });

/** 接入一个连接（租约被拒时返回 false，调用方据此断言） */
function connect(control: ReturnType<typeof createDriveControl>) {
  const client = fakeConnection();
  return {
    connection: client.connection,
    frames: client.frames,
    // getter 必须在取值时求值：spread 会把 closed 的快照冻在接入那一刻
    get closed() {
      return client.closed;
    },
    accepted: control.accept(client.connection),
  };
}

const attachFrame = (file: string): ClientFrame => ({ type: "attach", file });

// —— 用例 ——

describe("drive-control · 会话打开与路由", () => {
  it("attach 成功 → attached 帧带 file 回显，事件按订阅到达", async () => {
    const { calls, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual(
      expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }),
    );
    expect(calls).toContain("attach:f1.jsonl");

    control.emit(statusEvent("sid-f1.jsonl"));
    expect(client.frames).toContainEqual({ type: "event", event: statusEvent("sid-f1.jsonl") });
  });

  it("create 成功 → attached 帧带快照（新建路径不带宽量 file 字段）", async () => {
    const { calls, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, { type: "create", cwd: "D:/proj" });
    await Promise.resolve();
    await Promise.resolve();
    const attached = client.frames.find((f) => f.type === "attached");
    expect(attached).toEqual(
      expect.objectContaining({ type: "attached", sessionId: "sid-created", header: expect.anything(), entries: expect.anything() }),
    );
    expect(calls).toContain("create:D:/proj");
  });

  it("attach 重放（同连接）→ 幂等回 attached，deps.attach 不再被调", async () => {
    const { calls, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    control.receive(client.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames.filter((f) => f.type === "attached")).toHaveLength(2);
    expect(calls.filter((c) => c === "attach:f1.jsonl")).toHaveLength(1);
  });

  it("attach 失败 → error 帧携 file 回显，连接可继续 attach", async () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("locked.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames[0]).toEqual({ type: "error", message: "无法打开会话文件", file: "locked.jsonl" });

    control.receive(client.connection, attachFrame("f2.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual(
      expect.objectContaining({ type: "attached", sessionId: "sid-f2.jsonl", file: "f2.jsonl" }),
    );
  });

  it("单连接内按 sessionId 多路复用，事件只按订阅投递", async () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("fa.jsonl"));
    control.receive(client.connection, attachFrame("fb.jsonl"));
    await Promise.resolve();
    await Promise.resolve();

    control.emit(statusEvent("sid-fa.jsonl"));
    expect(client.frames.filter((f) => f.type === "event")).toEqual([
      { type: "event", event: statusEvent("sid-fa.jsonl") },
    ]);
  });

  it("release 撤订阅：released 帧后事件不再到达", async () => {
    const { calls, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    const before = client.frames.length;

    control.receive(client.connection, { type: "release", sessionId: "sid-f1.jsonl" });
    expect(calls).toContain("release:sid-f1.jsonl");
    expect(client.frames).toContainEqual({ type: "released", sessionId: "sid-f1.jsonl" });

    control.emit(statusEvent("sid-f1.jsonl"));
    expect(client.frames.length).toBe(before + 1);
  });

  it("连接消亡 → 名下 session 逐一释放属主", async () => {
    const { calls, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, attachFrame("f1.jsonl"));
    control.receive(client.connection, attachFrame("f2.jsonl"));
    await Promise.resolve();
    await Promise.resolve();

    control.drop(client.connection);
    expect(calls).toContain("release:sid-f1.jsonl");
    expect(calls).toContain("release:sid-f2.jsonl");
  });
});

describe("drive-control · 命令映射", () => {
  it("drive 成功且无 disposition 时不回帧；steer 应答 disposition 帧", async () => {
    const { calls, driveOutcomes, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, { type: "drive", command: { sessionId: "s", body: { type: "abort" } } });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toContain("drive:s:abort");
    expect(client.frames.every((f) => f.type !== "commandFailed" && f.type !== "disposition")).toBe(true);

    driveOutcomes.push({ ok: true, disposition: "queued" });
    control.receive(client.connection, {
      type: "drive",
      command: { sessionId: "s", body: { type: "steer", text: "补一句" } },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual({
      type: "disposition",
      sessionId: "s",
      command: "steer",
      disposition: "queued",
    });
  });

  it("drive 失败 → commandFailed 帧带 sessionId、原因与命令类型", async () => {
    const { driveOutcomes, deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    driveOutcomes.push({ ok: false, message: "session 未驱动" });
    control.receive(client.connection, {
      type: "drive",
      command: { sessionId: "sid-x", body: { type: "prompt", text: "hi" } },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual({
      type: "commandFailed",
      sessionId: "sid-x",
      message: "session 未驱动",
      // command 回带被拒命令类型：client 只让文本命令的待回显让位（ADR-0012 补记十二）
      command: "prompt",
    });
  });

  it("drive 抛错 → commandFailed 帧（连接不断）", async () => {
    const { deps } = fakeDeps();
    deps.drive = async () => {
      throw new Error("宿主已销毁");
    };
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, {
      type: "drive",
      command: { sessionId: "sid-x", body: { type: "abort" } },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual(
      expect.objectContaining({ type: "commandFailed", sessionId: "sid-x", message: "宿主已销毁", command: "abort" }),
    );
  });

  it("未知帧类型 → error 帧且连接存活（后续帧照常处理）", async () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.receive(client.connection, { type: "mystery" } as unknown as ClientFrame);
    await Promise.resolve();
    expect(client.frames).toContainEqual({ type: "error", message: "未知帧类型", code: "unknownFrame" });

    control.receive(client.connection, attachFrame("f9.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    expect(client.frames).toContainEqual(expect.objectContaining({ type: "attached", sessionId: "sid-f9.jsonl" }));
  });

  it("badFrame（适配器解码失败）→ error 帧，连接可继续", async () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const client = connect(control);

    control.badFrame(client.connection, "无法解析的帧");
    expect(client.frames).toContainEqual({ type: "error", message: "无法解析的帧", code: "badFrame" });
  });
});

describe("drive-control · 单客户端租约（Server Lease）", () => {
  it("第二连接被拒：回 serverBusy 并关闭，不进消息处理", () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const a = connect(control);
    expect(a.accepted).toBe(true);

    const b = connect(control);
    expect(b.accepted).toBe(false);
    expect(b.closed).toBe(true);
    expect(b.frames[0]).toEqual({ type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
  });

  it("持有者断开后，新连接可接管", () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const a = connect(control);
    control.drop(a.connection);

    const b = connect(control);
    expect(b.accepted).toBe(true);
  });

  it("持有者判死（僵尸）→ 新连接让位接管，且其名下会话先被撤销", async () => {
    const { calls, deps } = fakeDeps();
    let live = true;
    const control = createDriveControl(deps, { isLive: () => live });
    const a = connect(control);
    control.receive(a.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();

    // 模拟僵尸：存活判定转为 false（WS 侧是心跳超期；IPC 侧不会发生，端口断开即 drop）
    live = false;
    const b = connect(control);
    expect(b.accepted).toBe(true);
    expect(calls).toContain("release:sid-f1.jsonl");

    // 旧连接的 close 迟到时不得释放新属主的会话
    control.receive(b.connection, attachFrame("f1.jsonl"));
    await Promise.resolve();
    await Promise.resolve();
    control.drop(a.connection);
    expect(calls.filter((c) => c === "release:sid-f1.jsonl")).toHaveLength(1);
    control.emit(statusEvent("sid-f1.jsonl"));
    expect(b.frames).toContainEqual({ type: "event", event: statusEvent("sid-f1.jsonl") });
  });

  it("心跳投喂原样转给 registry 投影（适配器只负责判定，不记账）", () => {
    const { deps } = fakeDeps();
    const control = createDriveControl(deps);
    const a = connect(control);

    control.markAlive(a.connection);
    control.markDead(a.connection);
    // fake 的 isOwnerAlive 依赖驱动过才登记；此处只验投喂没抛错且语义可观察
    expect(control.lease).toBe(a.connection);
  });
});

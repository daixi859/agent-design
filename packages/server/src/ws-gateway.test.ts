/** WS 网关契约：协议信封、attach/create/release 生命周期、按 sessionId 多路复用（ADR-0012 阶段三） */
import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, type WebSocket as WsSocket } from "ws";
import type { ClientFrame, DriveEvent, ServerFrame } from "@pi-studio/shared/protocol";
import { createWsGateway, type DriveOutcome, type OpenedSession, type WsGatewayDeps } from "./ws-gateway.ts";

// —— 测试基建：真 http + ws 服务器（随机端口），deps 全 fake ——

function fakeDeps() {
  const calls: string[] = [];
  const driveOutcomes: DriveOutcome[] = [];
  // 基线快照：header 与 entries 都在 attach 回包里（create 的会话文件尚未落盘）
  const snap = (sessionId: string): OpenedSession => ({
    sessionId,
    snapshot: () => ({
      header: { type: "session", version: 3, id: sessionId, parentId: null, timestamp: "T0", cwd: "/p" },
      entries: [{ type: "message", id: `${sessionId}-m1`, parentId: null, timestamp: "T0", message: { role: "user", content: "hi" } }],
    }),
    catalog: () => ({}),
    usage: () => undefined,
  });
  // 属主单表的 fake（C7）：attach 即登记（owner + alive）、release 即撤销、
  // 活属主拒绝 / 判死属主可接管——registry 的窄投影语义
  const registrations = new Map<string, { opened: OpenedSession; file?: string; owner: object; alive: boolean }>();
  const deps: WsGatewayDeps = {
    attach: async (file, owner) => {
      calls.push(`attach:${file}`);
      if (file.endsWith("locked.jsonl")) throw new Error("已被驱动");
      const existing = [...registrations.entries()].find(([, reg]) => reg.file === file);
      if (existing) {
        const [, reg] = existing;
        if (reg.owner === owner) throw new Error("已被驱动");
        if (reg.alive) throw new Error("已被驱动");
        deps.release(existing[0]); // 僵尸接管：释放旧宿主
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
    sessionOf: (file) => [...registrations.entries()].find(([, reg]) => reg.file === file)?.[0],
    ownerOf: (sessionId) => registrations.get(sessionId)?.owner,
    isOwnerAlive: (owner) => [...registrations.values()].some((reg) => reg.owner === owner && reg.alive),
    markAlive: (owner) => {
      for (const reg of registrations.values()) if (reg.owner === owner) reg.alive = true;
    },
    markDead: (owner) => {
      for (const reg of registrations.values()) if (reg.owner === owner) reg.alive = false;
    },
    releaseByOwner: (owner) => {
      const ids = [...registrations.entries()].filter(([, reg]) => reg.owner === owner).map(([id]) => id);
      for (const id of ids) deps.release(id);
      return ids;
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

async function startServer(
  deps: WsGatewayDeps,
  opts?: { isLive?(socket: unknown): boolean; heartbeatMs?: number },
) {
  const server = createServer();
  const gateway = createWsGateway(deps, {
    ...(opts?.isLive ? { isLive: opts.isLive as (socket: WsSocket) => boolean } : {}),
    ...(opts?.heartbeatMs ? { heartbeatMs: opts.heartbeatMs } : {}),
  });
  gateway.bind(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    gateway,
    port,
    close: async () => {
      await gateway.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function connect(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const frames: ServerFrame[] = [];
  ws.on("message", (data) => {
    frames.push(JSON.parse(String(data)) as ServerFrame);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  const send = (frame: ClientFrame) => ws.send(JSON.stringify(frame));
  const rawSend = (text: string) => ws.send(text);
  const close = () =>
    new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  return { frames, opened, send, rawSend, close };
}

/** 轮询直到条件成立（事件经网络异步到达，无顺序保证） */
async function waitFor(pred: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!pred() && Date.now() - start < ms) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const statusEvent = (id: string): DriveEvent => ({ sessionId: id, body: { type: "status", status: "running" } });

// —— 用例 ——

describe("createWsGateway · 驱动协议传输", () => {
  it("attach 成功 → attached 帧，订阅的事件以 event 帧到达", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
      expect(client.frames).toContainEqual(expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }));
      expect(calls).toContain("attach:f1.jsonl");

      server.gateway.emit(statusEvent("sid-f1.jsonl"));
      await waitFor(() => client.frames.some((f) => f.type === "event"));
      expect(client.frames).toContainEqual({ type: "event", event: statusEvent("sid-f1.jsonl") });
    } finally {
      await server.close();
    }
  });

  it("create 成功 → attached 帧（新建路径）", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "create", cwd: "D:/proj" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
      expect(client.frames).toContainEqual(expect.objectContaining({ type: "attached", sessionId: "sid-created" }));
      expect(calls).toContain("create:D:/proj");
    } finally {
      await server.close();
    }
  });

  it("drive 命令转发 deps：无 disposition 时不回帧；steer 应答 disposition 帧", async () => {
    const { calls, driveOutcomes, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.length >= 1);

      client.send({ type: "drive", command: { sessionId: "sid-f1.jsonl", body: { type: "abort" } } });
      await waitFor(() => calls.some((c) => c === "drive:sid-f1.jsonl:abort"));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.frames.every((f) => f.type !== "commandFailed" && f.type !== "disposition")).toBe(true);

      driveOutcomes.push({ ok: true, disposition: "queued" });
      client.send({
        type: "drive",
        command: { sessionId: "sid-f1.jsonl", body: { type: "steer", text: "补一句" } },
      });
      await waitFor(() => client.frames.some((f) => f.type === "disposition"));
      expect(client.frames).toContainEqual({
        type: "disposition",
        sessionId: "sid-f1.jsonl",
        command: "steer",
        disposition: "queued",
      });
    } finally {
      await server.close();
    }
  });

  it("drive 失败 → commandFailed 帧带 sessionId 与原因", async () => {
    const { driveOutcomes, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.length >= 1);

      driveOutcomes.push({ ok: false, message: "session 未驱动" });
      client.send({ type: "drive", command: { sessionId: "sid-f1.jsonl", body: { type: "prompt", text: "hi" } } });
      await waitFor(() => client.frames.some((f) => f.type === "commandFailed"));
      expect(client.frames).toContainEqual({
        type: "commandFailed",
        sessionId: "sid-f1.jsonl",
        message: "session 未驱动",
        // command 回带被拒命令类型：client 只让文本命令的待回显让位（ADR-0012 补记十二）
        command: "prompt",
      });
    } finally {
      await server.close();
    }
  });

  it("attach 被拒 → error 帧、连接存活可继续 attach", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "locked.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "error"));
      // file 回显：Send-to-Attach 按它精确兑付失败（ADR-0012 补记十一）
      expect(client.frames[0]).toEqual({ type: "error", message: "已被驱动", file: "locked.jsonl" });

      client.send({ type: "attach", file: "f2.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
      expect(client.frames).toContainEqual(expect.objectContaining({ type: "attached", sessionId: "sid-f2.jsonl", file: "f2.jsonl" }));
    } finally {
      await server.close();
    }
  });

  it("同连接 attach 重放 → 幂等回 attached，deps.attach 不再被调", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));

      // 模拟 use-drive 断线重连的 onopen 重放：同一连接重复 attach
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.filter((f) => f.type === "attached").length >= 2);
      expect(calls.filter((c) => c === "attach:f1.jsonl")).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it("他端属主在册 → attach 被拒；属主断开释放后可重新 attach", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const a = connect(server.port);
      const b = connect(server.port);
      await Promise.all([a.opened, b.opened]);
      a.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => a.frames.some((f) => f.type === "attached"));

      b.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => b.frames.some((f) => f.type === "error"));
      expect(b.frames[0]).toEqual({ type: "error", message: "已被驱动", file: "f1.jsonl" });

      // 属主断开 → 属主释放 → b 可接管
      await a.close();
      await new Promise((resolve) => setTimeout(resolve, 30));
      b.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => b.frames.some((f) => f.type === "attached"));
      expect(b.frames).toContainEqual(expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }));
    } finally {
      await server.close();
    }
  });

  it("心跳超期属主被 terminate 后他人可接管（真心跳路径，此前零覆盖）", async () => {
    const { calls, deps } = fakeDeps();
    // isLive 只对属主连接判死：首个心跳 tick 即 markDead + terminate（模拟代理半开、
    // close 迟到）；属主身份在 attach 后从属主表取（OwnerToken 即服务端连接对象）
    let zombie: unknown = null;
    const server = await startServer(deps, { heartbeatMs: 40, isLive: (socket) => socket !== zombie });
    try {
      const a = connect(server.port);
      const b = connect(server.port);
      await Promise.all([a.opened, b.opened]);
      a.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => a.frames.some((f) => f.type === "attached"));
      zombie = deps.ownerOf("sid-f1.jsonl") ?? null;

      // tick：markDead(属主) → terminate → close → releaseByOwner 释放
      await waitFor(() => calls.some((c) => c === "release:sid-f1.jsonl"), 2000);

      // b 接管成功（活属主拒绝的判定读的是 markDead 后的属主表）
      b.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => b.frames.some((f) => f.type === "attached"));
      expect(b.frames).toContainEqual(
        expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }),
      );

      // b 的订阅仍在（后续 tick 判活投喂，不误杀）：事件继续到达
      server.gateway.emit(statusEvent("sid-f1.jsonl"));
      await waitFor(() => b.frames.some((f) => f.type === "event"));
      expect(b.frames).toContainEqual({ type: "event", event: statusEvent("sid-f1.jsonl") });
    } finally {
      await server.close();
    }
  });

  it("两个客户端按 sessionId 多路复用，互不串流", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const a = connect(server.port);
      const b = connect(server.port);
      await Promise.all([a.opened, b.opened]);
      a.send({ type: "attach", file: "fa.jsonl" });
      b.send({ type: "attach", file: "fb.jsonl" });
      await waitFor(() => a.frames.length >= 1 && b.frames.length >= 1);

      server.gateway.emit(statusEvent("sid-fa.jsonl"));
      await waitFor(() => a.frames.some((f) => f.type === "event"));
      expect(b.frames.some((f) => f.type === "event")).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("release 撤订阅：released 帧后事件不再到达", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.length >= 1);
      const countAfterAttach = client.frames.length;

      client.send({ type: "release", sessionId: "sid-f1.jsonl" });
      await waitFor(() => calls.some((c) => c === "release:sid-f1.jsonl"));
      await waitFor(() => client.frames.some((f) => f.type === "released"));

      server.gateway.emit(statusEvent("sid-f1.jsonl"));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(client.frames.length).toBe(countAfterAttach + 1);
    } finally {
      await server.close();
    }
  });

  it("连接断开 → 该连接持有的 session 逐一释放属主", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    const client = connect(server.port);
    await client.opened;
    client.send({ type: "attach", file: "f1.jsonl" });
    client.send({ type: "attach", file: "f2.jsonl" });
    await waitFor(() => calls.filter((c) => c.startsWith("attach:")).length >= 2);
    await client.close();
    await waitFor(() => calls.some((c) => c === "release:sid-f1.jsonl"));
    await waitFor(() => calls.some((c) => c === "release:sid-f2.jsonl"));
    await server.close();
  });

  it("坏 JSON 与未知帧类型 → error 帧且连接存活", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.rawSend("not-json{{");
      await waitFor(() => client.frames.some((f) => f.type === "error"));
      client.send({ type: "mystery" } as unknown as ClientFrame);
      await waitFor(() => client.frames.length >= 2);
      expect(client.frames.every((f) => f.type === "error")).toBe(true);

      client.send({ type: "attach", file: "f9.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
    } finally {
      await server.close();
    }
  });
});

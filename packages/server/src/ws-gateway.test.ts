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
  // 在册表：模拟 registry 的属主语义（attach 即登记、release 即撤销、重复 attach 拒绝）
  const driven = new Map<string, OpenedSession>();
  const files = new Map<string, string>();
  const deps: WsGatewayDeps = {
    attach: async (file) => {
      calls.push(`attach:${file}`);
      if (file.endsWith("locked.jsonl")) throw new Error("已被驱动");
      if (files.has(file)) throw new Error("已被驱动");
      const opened = snap(`sid-${file}`);
      driven.set(opened.sessionId, opened);
      files.set(file, opened.sessionId);
      return opened;
    },
    create: async (cwd) => {
      calls.push(`create:${cwd}`);
      const opened = snap("sid-created");
      driven.set(opened.sessionId, opened);
      return opened;
    },
    get: (sessionId) => driven.get(sessionId),
    sessionOf: (file) => files.get(file),
    release: (id) => {
      calls.push(`release:${id}`);
      const file = [...files.entries()].find(([, sid]) => sid === id)?.[0];
      if (file) files.delete(file);
      driven.delete(id);
    },
    drive: async (command) => {
      calls.push(`drive:${command.sessionId}:${command.body.type}`);
      return driveOutcomes.shift() ?? { ok: true };
    },
  };
  return { calls, driveOutcomes, deps };
}

async function startServer(deps: WsGatewayDeps, opts?: { isLive?(socket: unknown): boolean }) {
  const server = createServer();
  const gateway = createWsGateway(deps, {
    ...(opts?.isLive ? { isLive: opts.isLive as (socket: WsSocket) => boolean } : {}),
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
      expect(client.frames[0]).toEqual({ type: "error", message: "已被驱动" });

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
      expect(b.frames[0]).toEqual({ type: "error", message: "已被驱动" });

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

  it("僵尸属主被接管后其 close 迟到 → 不得释放新属主的会话", async () => {
    const { calls, deps } = fakeDeps();
    // 注入 isLive=false：任何在册属主都判为僵尸，模拟代理半开、close 迟到的连接
    const server = await startServer(deps, { isLive: () => false });
    try {
      const a = connect(server.port);
      const b = connect(server.port);
      await Promise.all([a.opened, b.opened]);
      a.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => a.frames.some((f) => f.type === "attached"));

      // b 接管（a 的注册被释放、订阅摘除，但 a 的 owned 集合里条目仍在）
      b.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => b.frames.some((f) => f.type === "attached"));
      const releasesAfterTakeover = calls.filter((c) => c === "release:sid-f1.jsonl").length;
      expect(releasesAfterTakeover).toBe(1);

      // 僵尸 a 的 close 迟到触发：不得把 b 正驱动的会话再释放一遍
      await a.close();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(calls.filter((c) => c === "release:sid-f1.jsonl")).toHaveLength(releasesAfterTakeover);

      // b 的订阅仍在：事件继续到达
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

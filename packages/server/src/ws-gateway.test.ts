/** WS 适配器契约（ADR-0019）：只测传输职责——`/ws` upgrade 握手、JSON 帧编解码、
 *  ping/pong 心跳传感器与 terminate、socket 生命周期到控制层的投喂。
 *  协议语义（attach 幂等重放、租约判定、drive 映射、事件路由）已在 drive-control.test
 *  逐条覆盖，这里不重复；唯一例外是「经真实 socket 的一次端到端」，
 *  它验证的是适配器与控制层的接线而不是语义本身。 */
import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { ClientFrame, ServerFrame } from "@pi-studio/shared/protocol";
import type { OpenedSession, WsGatewayDeps } from "./ws-gateway.ts";
import { createWsGateway } from "./ws-gateway.ts";

// —— 测试基建：真 http + ws 服务器（随机端口），deps 全 fake ——

function fakeDeps() {
  const calls: string[] = [];
  const snap = (sessionId: string): OpenedSession => ({
    sessionId,
    snapshot: () => ({
      header: { type: "session", version: 3, id: sessionId, parentId: null, timestamp: "T0", cwd: "/p" },
      entries: [],
    }),
    catalog: () => ({}),
    usage: () => undefined,
  });
  const registrations = new Map<string, { opened: OpenedSession; file?: string; owner: object; alive: boolean }>();
  const fileOf = (file: string) => [...registrations.entries()].find(([, reg]) => reg.file === file);
  const deps: WsGatewayDeps = {
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
    release: (id) => {
      calls.push(`release:${id}`);
      registrations.delete(id);
    },
    drive: async (command) => {
      calls.push(`drive:${command.sessionId}:${command.body.type}`);
      return { ok: true };
    },
  };
  return { calls, deps };
}

async function startServer(deps: WsGatewayDeps, opts?: { isLive?(socket: unknown): boolean }) {
  const server = createServer();
  const gateway = createWsGateway(deps, {
    ...(opts?.isLive ? { isLive: opts.isLive as never } : {}),
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

// —— 用例 ——

describe("ws-gateway · 传输职责", () => {
  it("端到端接线：attach 经 wire 到达控制层，attached 帧经 wire 回到客户端", async () => {
    const { calls, deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
      expect(client.frames).toContainEqual(
        expect.objectContaining({ type: "attached", sessionId: "sid-f1.jsonl", file: "f1.jsonl" }),
      );
      expect(calls).toContain("attach:f1.jsonl");
    } finally {
      await server.close();
    }
  });

  it("非 /ws 路径的 upgrade 请求被拒绝", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/not-ws`);
      const failed = await new Promise<boolean>((resolve) => {
        ws.on("open", () => resolve(false));
        ws.on("error", () => resolve(true));
      });
      expect(failed).toBe(true);
      ws.terminate();
    } finally {
      await server.close();
    }
  });

  it("坏 JSON → badFrame 错误帧（编解码失败不停连接）", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    try {
      const client = connect(server.port);
      await client.opened;
      client.rawSend("not-json{{");
      await waitFor(() => client.frames.some((f) => f.type === "error"));
      expect(client.frames[0]).toEqual({ type: "error", message: "无法解析的帧", code: "badFrame" });

      // 连接仍可用
      client.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => client.frames.some((f) => f.type === "attached"));
    } finally {
      await server.close();
    }
  });

  it("socket close → 控制层释放该连接名下会话（适配器投喂生命周期）", async () => {
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

  it("心跳超期（isLive 恒 false）→ 新连接让位接管，旧 socket 的属主被撤销", async () => {
    const { calls, deps } = fakeDeps();
    // isLive 恒 false：模拟代理后的半开连接——close 迟到数分钟，只能按心跳判死
    const server = await startServer(deps, { isLive: () => false });
    try {
      const a = connect(server.port);
      await a.opened;
      a.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => a.frames.some((f) => f.type === "attached"));

      const b = connect(server.port);
      await b.opened;
      // 僵尸让位：旧连接的属主先撤销
      await waitFor(() => calls.some((c) => c === "release:sid-f1.jsonl"));
      b.send({ type: "attach", file: "f1.jsonl" });
      await waitFor(() => b.frames.some((f) => f.type === "attached"));
      expect(b.frames).toContainEqual(expect.objectContaining({ type: "attached", file: "f1.jsonl" }));

      // 旧连接的 close 迟到时不得释放新属主的会话
      await a.close();
      await new Promise((resolve) => setTimeout(resolve, 30));
      server.gateway.emit({ sessionId: "sid-f1.jsonl", body: { type: "status", status: "running" } });
      await waitFor(() => b.frames.some((f) => f.type === "event"));
    } finally {
      await server.close();
    }
  });

  it("close() 硬断全部存活连接（宿主收尾不悬挂）", async () => {
    const { deps } = fakeDeps();
    const server = await startServer(deps);
    const client = connect(server.port);
    await client.opened;
    await server.close();
    const closed = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      ws.on("error", () => resolve(true));
      ws.on("open", () => resolve(false));
    });
    expect(closed).toBe(true);
  });
});

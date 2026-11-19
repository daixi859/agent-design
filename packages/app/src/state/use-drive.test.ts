/** DriveClient 编排层契约（C1 加深）：socketFactory + 时钟注入后，重连退避、重放、
    attach 竞态、在途兑付穿过接口测——补记十三的三个审查 bug 全在这层，从此有回归网 */
import { describe, expect, it } from "vitest";
import { DriveClient, type DriveClientDeps, type DriveSocket, type DriveSocketHandlers } from "./use-drive";
import type { ClientFrame, ServerFrame } from "@pi-studio/shared/protocol";

// ===== 假件：内存 socket + 可手推的时钟 =====

class FakeSocket implements DriveSocket {
  ready = false;
  readonly sent: ClientFrame[] = [];
  constructor(private readonly handlers: DriveSocketHandlers) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientFrame);
  }
  open(): void {
    this.ready = true;
    this.handlers.onOpen();
  }
  receive(frame: ServerFrame): void {
    this.handlers.onMessage(JSON.stringify(frame));
  }
  close(): void {
    this.ready = false;
    this.handlers.onClose();
  }
}

class FakeClock {
  private pending = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  private now = 0;
  readonly schedule = (fn: () => void, ms: number): number => {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  };
  readonly cancel = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };
  /** 推进挂钟：到期回调按时刻排序逐个执行（回调里新排的定时器同样参与） */
  advance(ms: number): void {
    const deadline = this.now + ms;
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= deadline)
        .sort((a, b) => a[1].at - b[1].at);
      if (due.length === 0) break;
      const [id, timer] = due[0];
      this.now = timer.at;
      this.pending.delete(id);
      timer.fn();
    }
    this.now = deadline;
  }
}

interface Harness {
  client: DriveClient;
  clock: FakeClock;
  sockets: FakeSocket[];
  readonly socket: FakeSocket;
}

/** 装配被测客户端：工厂把每条假 socket 收进数组，socket 取最近一条 */
function harness(): Harness {
  const sockets: FakeSocket[] = [];
  const clock = new FakeClock();
  const deps: DriveClientDeps = {
    socketFactory: (handlers) => {
      const socket = new FakeSocket(handlers);
      sockets.push(socket);
      return socket;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  };
  const client = new DriveClient(deps);
  return { client, clock, sockets, socket: sockets[sockets.length - 1] };
}

const framesOf = (socket: FakeSocket, type: ClientFrame["type"]): ClientFrame[] =>
  socket.sent.filter((frame) => frame.type === type);

const header = { type: "session" as const, version: 3, id: "s1", parentId: null, timestamp: "T0", cwd: "/p" };

// ===== 用例 =====

describe("Send-to-Attach 懒接管", () => {
  it("首条发送即 attach：乐观壳顶空窗，attach 帧携 file", () => {
    const h = harness();
    h.socket.open();
    expect(h.client.sendText("s-new", "第一条", "f1.jsonl")).toBe(true);
    expect(framesOf(h.socket, "attach")).toEqual([{ type: "attach", file: "f1.jsonl" }]);
    const shell = h.client.session("s-new");
    expect(shell?.pendingPrompt).toBe("第一条");
    expect(shell?.status).toBe("idle");
    expect(shell?.entries).toEqual([]);
  });

  it("attach 在途的后续发送入列不直发（补记十三 bug 1 回归），attached 后按序补发", () => {
    const h = harness();
    h.socket.open();
    expect(h.client.sendText("s-new", "第一条", "f1.jsonl")).toBe(true);
    // 乐观注册后调用方只剩 sessionId（不带 file）——第二条必须落「待补发」而非 prompt 直发
    expect(h.client.sendText("s-new", "第二条")).toBe(true);
    expect(framesOf(h.socket, "drive")).toEqual([]);
    h.socket.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    const prompts = framesOf(h.socket, "drive").map((frame) =>
      frame.type === "drive" ? frame.command.body : undefined,
    );
    expect(prompts).toEqual([
      { type: "prompt", text: "第一条", streamingBehavior: "followUp" },
      { type: "prompt", text: "第二条", streamingBehavior: "followUp" },
    ]);
  });

  it("attached 兑付序先 set 后 prompt（补记十二），挂起选择随即清", () => {
    const h = harness();
    h.socket.open();
    h.client.setPendingChoice("s-new", { provider: "deepseek", modelId: "m2", thinkingLevel: "high" });
    expect(h.client.sendText("s-new", "第一条", "f1.jsonl")).toBe(true);
    h.socket.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    const bodies = framesOf(h.socket, "drive").map((frame) =>
      frame.type === "drive" ? frame.command.body : undefined,
    );
    expect(bodies).toEqual([
      { type: "setModel", provider: "deepseek", modelId: "m2" },
      { type: "setThinkingLevel", level: "high" },
      { type: "prompt", text: "第一条", streamingBehavior: "followUp" },
    ]);
    expect(h.client.store.getState().pendingChoices.has("s-new")).toBe(false);
  });

  it("attach 被拒携 file 回显：撤乐观壳、回显让位，错误条兜底", () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    h.socket.receive({ type: "error", message: "不可驱动", code: "sessionConflict", file: "f1.jsonl" });
    expect(h.client.session("s-new")).toBeUndefined();
    expect(h.client.connectionError?.code).toBe("sessionConflict");
    // 在途登记已清：重发不再误入「待补发」通道
    expect(h.client.sendText("s-new", "重试", "f1.jsonl")).toBe(true);
    expect(framesOf(h.socket, "attach")).toHaveLength(2);
  });

  it("无 file 关联的连接级错误不撤乐观壳（回显必须顶住）", () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    h.socket.receive({ type: "error", message: "坏帧", code: "badFrame" });
    expect(h.client.session("s-new")?.pendingPrompt).toBe("第一条");
  });

  it("attach 在途镜像：懒接管置位，attached 兑付 / 被拒 / 解除即清（C3 attaching 判据）", () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    expect(h.client.isAttaching("s-new")).toBe(true);
    h.socket.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    expect(h.client.isAttaching("s-new")).toBe(false);
    // 再走一轮被拒路径：镜像随兑付失败清位
    h.client.sendText("s2", "第二条", "f2.jsonl");
    expect(h.client.isAttaching("s2")).toBe(true);
    h.socket.receive({ type: "error", message: "不可驱动", code: "sessionConflict", file: "f2.jsonl" });
    expect(h.client.isAttaching("s2")).toBe(false);
  });
});

describe("单客户端租约（serverBusy）重连", () => {
  it("被占时落错误位，断线后按重连退避短重试，用尽后停在阻断态", () => {
    const h = harness();
    h.socket.open();
    h.socket.receive({ type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
    expect(h.client.connectionError?.code).toBe("serverBusy");
    // 被拒后连接关闭：按退避 500→1000→2000 重连，共 3 次
    const delays = [500, 1000, 2000];
    for (const delay of delays) {
      h.sockets[h.sockets.length - 1].close();
      h.clock.advance(delay);
      const reconnected = h.sockets[h.sockets.length - 1];
      // 新 socket 仍被占：继续被拒
      reconnected.open();
      reconnected.receive({ type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
    }
    const before = h.sockets.length;
    h.sockets[h.sockets.length - 1].close();
    h.clock.advance(60000); // 次数用尽：不再重连，停在阻断页
    expect(h.sockets.length).toBe(before);
    expect(h.client.connectionError?.code).toBe("serverBusy");
  });

  it("租约释放后重连成功：非错误帧清错误位并重置计数", () => {
    const h = harness();
    h.socket.open();
    h.socket.receive({ type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
    h.socket.close();
    h.clock.advance(500);
    const reconnected = h.sockets[h.sockets.length - 1];
    reconnected.open();
    reconnected.receive({ type: "attached", sessionId: "s-x", file: "x.jsonl", header, entries: [] });
    expect(h.client.connectionError).toBeUndefined();
  });
});

describe("连接生命周期", () => {
  it("create 快乐路径：attached 无 file 兑付 sessionId", async () => {
    const h = harness();
    h.socket.open();
    const pending = h.client.create("/p");
    expect(framesOf(h.socket, "create")).toEqual([{ type: "create", cwd: "/p" }]);
    h.socket.receive({ type: "attached", sessionId: "s-created", entries: [] });
    await expect(pending).resolves.toBe("s-created");
  });

  it("断线：待定 create 立即失败，懒发送保留并随重连重放", async () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    const pending = h.client.create("/p");
    h.socket.close();
    await expect(pending).rejects.toThrow("驱动连接已断开");
    expect(h.client.session("s-new")?.pendingPrompt).toBe("第一条");
    // 退避 500ms 后重连，onopen 按 known file 重放 attach（懒发送在途 file 在内）
    h.clock.advance(500);
    const reconnected = h.sockets[h.sockets.length - 1];
    expect(reconnected).not.toBe(h.socket);
    reconnected.open();
    expect(framesOf(reconnected, "attach")).toEqual([{ type: "attach", file: "f1.jsonl" }]);
    reconnected.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    const prompts = framesOf(reconnected, "drive").filter(
      (frame) => frame.type === "drive" && frame.command.body.type === "prompt",
    );
    expect(prompts).toHaveLength(1);
  });

  it("已驱动会话断线重连：按 file 表重放 attach（幂等）", () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    h.socket.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    h.socket.close();
    h.clock.advance(500);
    const reconnected = h.sockets[h.sockets.length - 1];
    reconnected.open();
    expect(framesOf(reconnected, "attach")).toEqual([{ type: "attach", file: "f1.jsonl" }]);
  });

  it("退避倍增：连续断线的重连间隔 500→1000→2000", () => {
    const h = harness();
    h.socket.close();
    h.clock.advance(500);
    h.sockets[h.sockets.length - 1].close();
    h.clock.advance(500); // 第一次间隔是 500，此时第二条尚未到点
    expect(h.sockets).toHaveLength(2);
    h.clock.advance(500);
    expect(h.sockets).toHaveLength(3);
  });

  it("release 撤懒发送：attached 回包不得再补发 prompt", () => {
    const h = harness();
    h.socket.open();
    h.client.sendText("s-new", "第一条", "f1.jsonl");
    h.client.release("s-new");
    h.socket.receive({ type: "attached", sessionId: "s-new", file: "f1.jsonl", header, entries: [] });
    expect(framesOf(h.socket, "drive")).toEqual([]);
    // attached 帧本身会登记会话壳，但壳上不得有滞留的待回显
    expect(h.client.session("s-new")?.pendingPrompt).toBeUndefined();
  });

  it("连接未就绪时懒接管返回 false（调用方不得清草稿）", () => {
    const h = harness();
    expect(h.client.sendText("s-new", "第一条", "f1.jsonl")).toBe(false);
    expect(h.client.session("s-new")).toBeUndefined();
    expect(framesOf(h.socket, "attach")).toEqual([]);
  });

  it("连接未就绪时 create 立即拒绝", async () => {
    const h = harness();
    await expect(h.client.create("/p")).rejects.toThrow("驱动连接未就绪");
    expect(framesOf(h.socket, "create")).toEqual([]);
  });
});

describe("运行中发送（ADR-0017 排队语义）", () => {
  const busyAttached = (h: Harness): void => {
    h.socket.open();
    h.client.sendText("s1", "第一条", "f1.jsonl");
    h.socket.receive({ type: "attached", sessionId: "s1", file: "f1.jsonl", header, entries: [] });
    h.socket.receive({ type: "event", event: { sessionId: "s1", body: { type: "status", status: "running" } } });
  };

  it("busy → followUp 排队：本地待确认 echo 顶住空窗", () => {
    const h = harness();
    busyAttached(h);
    expect(h.client.sendText("s1", "排队一")).toBe(true);
    expect(framesOf(h.socket, "drive")).toContainEqual({
      type: "drive",
      command: { sessionId: "s1", body: { type: "followUp", text: "排队一" } },
    });
    expect(h.client.session("s1")?.pendingQueue).toEqual(["排队一"]);
  });

  it("queue 快照（权威）到达，本地待确认让位", () => {
    const h = harness();
    busyAttached(h);
    h.client.sendText("s1", "排队一");
    h.socket.receive({
      type: "event",
      event: { sessionId: "s1", body: { type: "queue", steering: [], followUp: ["排队一"] } },
    });
    expect(h.client.session("s1")?.pendingQueue).toBeUndefined();
    expect(h.client.session("s1")?.queued).toEqual({ steering: [], followUp: ["排队一"] });
  });

  it("steerText 在 busy 下走 steer 通道；idle 回落普通发送", () => {
    const h = harness();
    busyAttached(h);
    h.client.steerText("s1", "插话");
    expect(framesOf(h.socket, "drive")).toContainEqual({
      type: "drive",
      command: { sessionId: "s1", body: { type: "steer", text: "插话" } },
    });
    h.socket.receive({ type: "event", event: { sessionId: "s1", body: { type: "status", status: "idle" } } });
    h.client.steerText("s1", "空闲发送");
    expect(framesOf(h.socket, "drive")).toContainEqual({
      type: "drive",
      command: { sessionId: "s1", body: { type: "prompt", text: "空闲发送", streamingBehavior: "followUp" } },
    });
  });

  it("idle prompt 挂待回显；权威 user 条目回传即让位", () => {
    const h = harness();
    busyAttached(h);
    h.socket.receive({ type: "event", event: { sessionId: "s1", body: { type: "status", status: "idle" } } });
    h.client.sendText("s1", "新一条");
    expect(h.client.session("s1")?.pendingPrompt).toBe("新一条");
    h.socket.receive({
      type: "event",
      event: {
        sessionId: "s1",
        body: {
          type: "entry",
          entry: { type: "message", id: "u1", parentId: null, timestamp: "T1", message: { role: "user", content: "新一条" } },
        },
      },
    });
    expect(h.client.session("s1")?.pendingPrompt).toBeUndefined();
  });

  it("setModel 被拒只落 lastError，不抹待回显（补记十三 bug 2 回归）", () => {
    const h = harness();
    busyAttached(h);
    h.socket.receive({ type: "event", event: { sessionId: "s1", body: { type: "status", status: "idle" } } });
    h.client.sendText("s1", "带着气泡的消息");
    h.client.setModel("s1", "unknown", "m");
    h.socket.receive({ type: "commandFailed", sessionId: "s1", message: "未知模型", command: "setModel" });
    expect(h.client.session("s1")?.pendingPrompt).toBe("带着气泡的消息");
    expect(h.client.session("s1")?.lastError).toBe("未知模型");
  });

  it("prompt 被拒（commandFailed 携 command）才让待回显让位", () => {
    const h = harness();
    busyAttached(h);
    h.socket.receive({ type: "event", event: { sessionId: "s1", body: { type: "status", status: "idle" } } });
    h.client.sendText("s1", "会消失的气泡");
    h.socket.receive({ type: "commandFailed", sessionId: "s1", message: "内核拒绝", command: "prompt" });
    expect(h.client.session("s1")?.pendingPrompt).toBeUndefined();
    expect(h.client.session("s1")?.lastError).toBe("内核拒绝");
  });
});

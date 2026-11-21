/** configure 缝（ADR-0019 ③）：单例换传输后 connect() 用注入件、不注入时仍要求真 WebSocket。
    沿 use-drive.test.ts 的假 socket 先例——注入口只有一条，行为断言与既有契约同一口径。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveClient, type DriveSocket, type DriveSocketHandlers } from "./use-drive";
import type { ClientFrame } from "@pi-studio/shared/protocol";

class FakeSocket implements DriveSocket {
  ready = false;
  readonly sent: ClientFrame[] = [];
  readonly closes: number[] = [];
  constructor(private readonly handlers: DriveSocketHandlers) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientFrame);
  }
  open(): void {
    this.ready = true;
    this.handlers.onOpen();
  }
  close(): void {
    this.closes.push(1);
    this.ready = false;
    this.handlers.onClose();
  }
}

interface FakeFactory {
  factory: (handlers: DriveSocketHandlers) => DriveSocket;
  readonly sockets: FakeSocket[];
}

/** 假 socket 工厂：逐条收进数组，socket 顺序即建连顺序 */
function fakeFactory(): FakeFactory {
  const sockets: FakeSocket[] = [];
  return {
    factory: (handlers) => {
      const socket = new FakeSocket(handlers);
      sockets.push(socket);
      return socket;
    },
    sockets,
  };
}

/** 浏览器全局假件：WebSocket 与 location 在场时，客户端的缺省工厂才是真 WS 那一个 */
class StubWebSocket {
  static readonly OPEN = 1;
  static instances: StubWebSocket[] = [];
  readyState = StubWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;
  constructor(readonly url: string) {
    StubWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

function stubBrowserGlobals(): void {
  StubWebSocket.instances = [];
  vi.stubGlobal("WebSocket", StubWebSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:5173" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  StubWebSocket.instances = [];
});

describe("configure 缝 · 注入生效", () => {
  it("node 环境构造的客户端本不连接；configure 注入假 socket 后 connect() 用注入件", () => {
    const client = new DriveClient();
    // 无浏览器全局 → 无缺省工厂：不连接，懒接管也没有凭证
    expect(client.sendText("s1", "第一条", "f1.jsonl")).toBe(false);

    const fake = fakeFactory();
    client.configure({ socketFactory: fake.factory });
    expect(fake.sockets).toHaveLength(1);
    fake.sockets[0].open();
    expect(client.sendText("s1", "第一条", "f1.jsonl")).toBe(true);
    expect(fake.sockets[0].sent).toEqual([{ type: "attach", file: "f1.jsonl" }]);
  });

  it("换传输即收编旧连接：旧 socket 的迟到回调不再排重连（世代守卫）", () => {
    const first = fakeFactory();
    const client = new DriveClient({ socketFactory: first.factory });
    first.sockets[0].open();

    const second = fakeFactory();
    client.configure({ socketFactory: second.factory });
    // configure 主动断开旧连接
    expect(first.sockets[0].closes).toHaveLength(1);
    expect(second.sockets).toHaveLength(1);

    // 旧连接的迟到 onClose（真 WS 关断是异步的）不得再排重连：否则两条连接互相撞租约
    first.sockets[0].close();
    expect(second.sockets).toHaveLength(1);
    expect(client.connectionError).toBeUndefined();

    // 新连接照常工作
    second.sockets[0].open();
    expect(client.sendText("s1", "第一条", "f1.jsonl")).toBe(true);
    expect(second.sockets[0].sent).toEqual([{ type: "attach", file: "f1.jsonl" }]);
  });

  it("换传输后重放只走新连接：known file 集跨传输保留", () => {
    const first = fakeFactory();
    const client = new DriveClient({ socketFactory: first.factory });
    first.sockets[0].open();
    client.sendText("s1", "第一条", "f1.jsonl");

    const second = fakeFactory();
    client.configure({ socketFactory: second.factory });
    second.sockets[0].open();
    expect(second.sockets[0].sent).toEqual([{ type: "attach", file: "f1.jsonl" }]);
  });
});

describe("configure 缝 · 不注入时仍是真 WebSocket", () => {
  it("浏览器全局在场时构造即持有真 WS 缺省工厂；configure 不传 socketFactory 不改行为", () => {
    stubBrowserGlobals();
    const client = new DriveClient();
    expect(StubWebSocket.instances).toHaveLength(1);
    expect(StubWebSocket.instances[0].url).toBe("ws://localhost:5173/ws");

    // 空配置：未传 socketFactory → 空操作，不额外建连、不换传输
    client.configure({});
    expect(StubWebSocket.instances).toHaveLength(1);
    // 真 WS 收到 open 后帧照旧上真 socket
    StubWebSocket.instances[0].onopen?.();
    client.sendText("s1", "第一条", "f1.jsonl");
    expect(StubWebSocket.instances[0].sent).toEqual([JSON.stringify({ type: "attach", file: "f1.jsonl" })]);
  });

  it("node 环境只 configure 空对象：不注入就什么都不做", () => {
    const client = new DriveClient();
    client.configure({});
    expect(client.sendText("s1", "第一条", "f1.jsonl")).toBe(false);
    expect(client.connectionError).toBeUndefined();
  });
});

describe("DriveClient · autoConnect（桌面壳单例不自动建连）", () => {
  it("autoConnect: false 时构造不调用 socketFactory；configure 之后才建连", () => {
    const sockets: string[] = [];
    const deps = {
      autoConnect: false,
      socketFactory: (handlers: { onOpen(): void }) => {
        sockets.push("connected");
        queueMicrotask(() => handlers.onOpen());
        return { send: () => undefined, ready: true };
      },
    };
    const client = new DriveClient(deps);
    expect(sockets).toEqual([]);

    client.configure({ socketFactory: deps.socketFactory });
    expect(sockets).toEqual(["connected"]);
  });

  it("缺省仍构造即建连（web 形态行为不变）", () => {
    const sockets: string[] = [];
    new DriveClient({
      socketFactory: () => {
        sockets.push("connected");
        return { send: () => undefined, ready: true };
      },
    });
    expect(sockets).toEqual(["connected"]);
  });
});

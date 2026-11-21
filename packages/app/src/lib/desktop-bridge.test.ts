/** 桌面桥探针（ADR-0019 ①）：window.piDesktop 有/无与形状残缺时探针的判定口径，
    以及桥的两面接进 app 既有缝后的行为（取数 → pi-client 的 fetch 缝；
    驱动 socket → DriveClient 的 SocketFactory）。测试环境是 node（无 window），
    故一律手工挂 globalThis.window —— 与 use-drive.ts 的「typeof 检测」同一口径，
    不需要 jsdom。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bridgeFetcher,
  desktopSocketFactory,
  getDesktopBridge,
  isDesktopShell,
  type DesktopDriveSocket,
  type PiDesktopBridge,
} from "./desktop-bridge";

/** 最小桥连接假件：send 与 postMessage 同义（同一发帧动作的两个动词） */
function fakeSocket(seen?: { posted: string[]; closes: number }): DesktopDriveSocket {
  const post = (data: string) => void seen?.posted.push(data);
  return {
    send: post,
    postMessage: post,
    close: () => {
      if (seen) seen.closes += 1;
    },
    ready: true,
  };
}

/** 最小桥假件：取数按传入实现，socket 工厂每次造一条新连接 */
function fakeBridge(apiFetch?: PiDesktopBridge["apiFetch"]): PiDesktopBridge {
  return {
    apiFetch: apiFetch ?? (() => Promise.resolve({ ok: true })),
    createDriveSocket: () => fakeSocket(),
  };
}

/** 挂 window（含其中 piDesktop 槽位）；测试结束由 afterEach 摘掉 */
function withWindow(piDesktop?: unknown): void {
  vi.stubGlobal("window", piDesktop === undefined ? {} : { piDesktop });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop-bridge · 探针", () => {
  it("无 window（SSR / node 导入）：探针返回 undefined，不抛", () => {
    expect(typeof window).toBe("undefined");
    expect(getDesktopBridge()).toBeUndefined();
    expect(isDesktopShell()).toBe(false);
  });

  it("有 window 但无 piDesktop（web 形态）：探针返回 undefined", () => {
    withWindow();
    expect(getDesktopBridge()).toBeUndefined();
    expect(isDesktopShell()).toBe(false);
  });

  it("piDesktop 在场且形状完整：探针返回同一个桥对象", () => {
    const bridge = fakeBridge();
    withWindow(bridge);
    expect(getDesktopBridge()).toBe(bridge);
    expect(isDesktopShell()).toBe(true);
  });

  it("半注入的桥（preload 与渲染层版本错配）：一律按缺席处理", () => {
    withWindow({ apiFetch: () => Promise.resolve({}) });
    expect(getDesktopBridge()).toBeUndefined();
    withWindow({ createDriveSocket: () => fakeSocket() });
    expect(getDesktopBridge()).toBeUndefined();
    withWindow("piDesktop");
    expect(getDesktopBridge()).toBeUndefined();
    withWindow(null);
    expect(getDesktopBridge()).toBeUndefined();
  });
});

describe("desktop-bridge · 取数适配", () => {
  it("桥的 apiFetch 结果装成 200 JSON 响应，交给 pi-client 的 HTTP 语义", async () => {
    const paths: string[] = [];
    const bridge = fakeBridge((path) => {
      paths.push(path);
      return Promise.resolve({ sessions: [], rootExists: true });
    });
    const res = await bridgeFetcher(bridge)("/api/sessions");
    expect(paths).toEqual(["/api/sessions"]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sessions: [], rootExists: true });
  });

  it("桥失败原样冒泡（错误文案由 preload 给），不伪造响应", async () => {
    const bridge = fakeBridge(() => Promise.reject(new Error("app:// 取数失败")));
    await expect(bridgeFetcher(bridge)("/api/sessions")).rejects.toThrow("app:// 取数失败");
  });

  it("桥解出 undefined（空体端点）：仍给出可解析的空对象，避免 json() 抛", async () => {
    const bridge = fakeBridge(() => Promise.resolve(undefined));
    const res = await bridgeFetcher(bridge)("/api/sessions");
    await expect(res.json()).resolves.toEqual({});
  });
});

describe("desktop-bridge · socket 适配", () => {
  it("桥连接即 DriveSocket（类型上 extends）：工厂直出同一条连接，发帧与断连都落在它身上", () => {
    const seen = { posted: [] as string[], closes: 0 };
    const socket = fakeSocket(seen);
    const bridge: PiDesktopBridge = { apiFetch: () => Promise.resolve({}), createDriveSocket: () => socket };
    const produced = desktopSocketFactory(bridge)({ onOpen: () => {}, onMessage: () => {}, onClose: () => {} });
    expect(produced).toBe(socket); // 不复制造型：DriveClient 拿到的就是桥那条连接
    expect(produced.ready).toBe(true);
    produced.send('{"type":"attach","file":"f.jsonl"}');
    expect(seen.posted).toEqual(['{"type":"attach","file":"f.jsonl"}']);
    produced.close?.();
    expect(seen.closes).toBe(1);
  });

  it("ready 每次读取都透传桥的真实状态（不缓存、不落快照）", () => {
    let ready = false;
    const bridge: PiDesktopBridge = {
      apiFetch: () => Promise.resolve({}),
      createDriveSocket: () => ({
        send: () => {},
        postMessage: () => {},
        close: () => {},
        get ready() {
          return ready;
        },
      }),
    };
    const socket = desktopSocketFactory(bridge)({ onOpen: () => {}, onMessage: () => {}, onClose: () => {} });
    expect(socket.ready).toBe(false);
    ready = true;
    expect(socket.ready).toBe(true);
  });

  it("回调面原样交给桥（onOpen / onMessage / onClose 不拦截不重写）", () => {
    let received: Parameters<PiDesktopBridge["createDriveSocket"]>[0] | undefined;
    const bridge: PiDesktopBridge = {
      apiFetch: () => Promise.resolve({}),
      createDriveSocket: (handlers) => {
        received = handlers;
        return fakeSocket();
      },
    };
    const seen: string[] = [];
    const handlers = {
      onOpen: () => void seen.push("open"),
      onMessage: (data: string) => void seen.push(`message:${data}`),
      onClose: () => void seen.push("close"),
    };
    desktopSocketFactory(bridge)(handlers);
    expect(received).toBe(handlers);
    received?.onOpen();
    received?.onMessage("帧");
    received?.onClose();
    expect(seen).toEqual(["open", "message:帧", "close"]);
  });
});

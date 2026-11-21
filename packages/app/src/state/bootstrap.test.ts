/** 引导接线（ADR-0019 ④）：桥在场 → 两条缝接通且跳过 SW；桥缺席 → 三条一律不动。
    测试环境为 node（无 window / navigator），故探针路径用 stubGlobal 手工挂，
    接线落点则注入替身——只断言「哪条分支接了什么」，不重复测被测件本身。 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapTransport, registerServiceWorker } from "./bootstrap";
import type { ApiFetch } from "../lib/pi-client";
import type { PiDesktopBridge } from "../lib/desktop-bridge";
import type { DriveClientSetup } from "./use-drive";

/** 最小桥假件：取数返回固定体，socket 工厂返回同构假连接 */
function fakeBridge(seen?: { paths: string[]; sockets: number }): PiDesktopBridge {
  return {
    apiFetch: (path) => {
      seen?.paths.push(path);
      return Promise.resolve({ ok: true });
    },
    createDriveSocket: () => {
      if (seen) seen.sockets += 1;
      return { send: () => {}, postMessage: () => {}, close: () => {}, ready: true };
    },
  };
}

/** 接线替身：记下取了哪条分支 */
function spyDeps() {
  const fetchCalls: ApiFetch[] = [];
  const setups: DriveClientSetup[] = [];
  return {
    setFetch: (next: ApiFetch | undefined) => {
      if (next) fetchCalls.push(next);
    },
    fetchCalls,
    client: { configure: (setup: DriveClientSetup) => void setups.push(setup) },
    setups,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bootstrapTransport · 浏览器形态（桥缺席）", () => {
  it("不碰取数缝、不碰驱动连接，只注册 SW", () => {
    vi.stubGlobal("window", {});
    const spy = spyDeps();
    let registered = 0;
    const result = bootstrapTransport({
      setFetch: spy.setFetch,
      client: spy.client,
      registerWorker: () => {
        registered += 1;
        return true;
      },
    });
    expect(spy.fetchCalls).toEqual([]);
    expect(spy.setups).toEqual([]);
    expect(registered).toBe(1);
    expect(result).toEqual({ serviceWorker: true });
  });

  it("SW 环境不支持（无 navigator.serviceWorker）：registers = false 且不抛", () => {
    const result = bootstrapTransport({ bridge: undefined, registerWorker: () => false });
    expect(result.serviceWorker).toBe(false);
  });
});

describe("bootstrapTransport · 桌面壳（桥在场）", () => {
  it("取数改走桥的 apiFetch（自定义协议），驱动连接换成桥的 socket 工厂", async () => {
    const seen = { paths: [] as string[], sockets: 0 };
    const bridge = fakeBridge(seen);
    vi.stubGlobal("window", { piDesktop: bridge });
    const spy = spyDeps();
    const result = bootstrapTransport({ setFetch: spy.setFetch, client: spy.client, registerWorker: () => true });

    // ③ SW 跳过：即便环境支持也不注册
    expect(result.serviceWorker).toBe(false);
    expect(result.bridge).toBe(bridge);

    // ① 取数缝：注入的是桥的适配件，路径原样透传
    expect(spy.fetchCalls).toHaveLength(1);
    const fetcher = spy.fetchCalls[0];
    const res = await fetcher("/api/sessions");
    expect(seen.paths).toEqual(["/api/sessions"]);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // ② 驱动缝：注入的工厂产出桥的连接（结构上是 DriveSocket）
    expect(spy.setups).toHaveLength(1);
    const socket = spy.setups[0].socketFactory?.({
      onOpen: () => {},
      onMessage: () => {},
      onClose: () => {},
    });
    expect(seen.sockets).toBe(1);
    expect(socket?.ready).toBe(true);
  });

  it("桥的探针从 window.piDesktop 读：半注入的桥按缺席处理（仍注册 SW）", () => {
    vi.stubGlobal("window", { piDesktop: { apiFetch: () => Promise.resolve({}) } });
    const spy = spyDeps();
    const result = bootstrapTransport({ setFetch: spy.setFetch, client: spy.client, registerWorker: () => true });
    expect(result.bridge).toBeUndefined();
    expect(result.serviceWorker).toBe(true);
    expect(spy.fetchCalls).toEqual([]);
    expect(spy.setups).toEqual([]);
  });
});

describe("registerServiceWorker · 环境面", () => {
  it("无 navigator / 无 window（SSR）返回 false，不抛", () => {
    expect(registerServiceWorker({}, undefined)).toBe(false);
  });

  it("有 SW：挂 load 监听，触发时才注册 /sw.js；注册失败被吞（静默降级）", async () => {
    const listeners: Array<() => void> = [];
    const registered: string[] = [];
    const nav = {
      serviceWorker: {
        register: (url: string) => {
          registered.push(url);
          return Promise.reject(new Error("无 sw.js"));
        },
      },
    };
    const win = { addEventListener: (_type: "load", listener: () => void) => void listeners.push(listener) };
    expect(registerServiceWorker(nav, win)).toBe(true);
    expect(registered).toEqual([]); // 等 load：不在模块求值期注册
    listeners[0]();
    expect(registered).toEqual(["/sw.js"]);
    // 拒绝被吞：调用方不会收到未处理拒绝
    await Promise.resolve();
  });
});

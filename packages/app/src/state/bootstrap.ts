// 引导接线（ADR-0019 ④）：检测 preload 注入的桌面桥，接通两条传输缝并跳过 service worker。
// 单拎成模块而不是内联进 main.tsx，为的是让「壳内 / 浏览器」两种引导可测（main.tsx 只调一次）。
// 浏览器形态下 getDesktopBridge() 恒为 undefined：本模块每条分支都要落到「与改动前相同」
// ——取数仍走相对路径 fetch，驱动仍连真 WebSocket，PWA 仍注册。
import {
  bridgeFetcher,
  desktopSocketFactory,
  getDesktopBridge,
  type PiDesktopBridge,
} from "../lib/desktop-bridge";
import { configureFetch, type ApiFetch } from "../lib/pi-client";
import { drive, type DriveClient, type DriveClientSetup } from "./use-drive";

/** 引导结果：检测到桌面桥时返回它（供冒烟与调试观察），浏览器形态不带桥 */
export interface BootstrapResult {
  /** 桌面壳内为桥；浏览器形态为 undefined */
  bridge?: PiDesktopBridge;
  /** 本次引导是否发起 service worker 注册（桌面壳内恒 false） */
  serviceWorker: boolean;
}

/** 引导落点（可注入替身以便测试；生产一律用缺省：取数缝 + 模块级单例 + 真 SW 注册） */
export interface BootstrapDeps {
  /** 桌面桥；缺省取 window.piDesktop 探针 */
  bridge?: PiDesktopBridge;
  /** 取数缝的落点：缺省 configureFetch */
  setFetch?: (fetch: ApiFetch | undefined) => void;
  /** 驱动连接的落点：缺省模块级单例 drive */
  client?: Pick<DriveClient, "configure">;
  /** SW 注册动作：缺省 registerServiceWorker */
  registerWorker?: () => boolean;
}

/** service worker 可注册的最小环境面（便于无 window / SSR 的测试直接喂假件） */
type SwNavigator = { serviceWorker?: { register(url: string): Promise<unknown> } } | undefined;
type SwWindow = { addEventListener(type: "load", listener: () => void): void } | undefined;

/**
 * service worker 注册（PWA，Chrome 安装流；network-first 策略对 Vite HMR 安全）：
 * 仅浏览器形态调用，注册失败静默降级为普通网页——无 SW 时浏览器仍可正常使用，
 * 只失去安装与离线能力。返回值 = 是否发起注册（无 navigator / 无 SW / 无 window 时 false）。
 */
export function registerServiceWorker(
  nav: SwNavigator = globalThis.navigator as SwNavigator,
  win: SwWindow = globalThis.window as SwWindow,
): boolean {
  const worker = nav && "serviceWorker" in nav ? nav.serviceWorker : undefined;
  // 无 navigator（SSR）/ 无 SW（桌面壳的自定义协议页）时不注册
  if (!worker || !win) return false;
  win.addEventListener("load", () => {
    worker.register("/sw.js").catch(() => {
      // 静默降级：见上
    });
  });
  return true;
}

/**
 * 应用引导（ADR-0019 ④）：桥在场则 ① 取数改走桥（自定义协议）② 驱动连接改用桥的
 * socket 工厂 ③ 跳过 SW 注册；桥缺席则三条一律不动（浏览器形态行为不变）。
 * 须在首次取数 / 首次连接之前调用——现由 main.tsx 在渲染前同步执行。
 */
export function bootstrapTransport(deps: BootstrapDeps = {}): BootstrapResult {
  const bridge = deps.bridge ?? getDesktopBridge();
  const registerWorker = deps.registerWorker ?? registerServiceWorker;
  if (!bridge) {
    return { serviceWorker: registerWorker() };
  }
  const setFetch = deps.setFetch ?? configureFetch;
  const client: Pick<DriveClient, "configure"> = deps.client ?? drive;
  setFetch(bridgeFetcher(bridge));
  // 换传输即重建连接：单例构造期的 WS 由 configure 拆掉，改由桥建连（IPC）
  const setup: DriveClientSetup = { socketFactory: desktopSocketFactory(bridge) };
  client.configure(setup);
  // 桌面壳内 PWA 无意义（无安装流、无离线语义；ADR-0019 ④）
  return { bridge, serviceWorker: false };
}

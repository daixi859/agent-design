// 桌面壳 main 进程（ADR-0019）：直装内核、零数据服务端口。
//   浏览路径 → app:// 自定义协议（main 内直答，见 ./app-protocol.ts）
//   驱动协议 → IPC 适配器（与 WS 同语义，见 ./ipc-driver.ts）
// 组装与 server/main.ts 逐条同源：registry 窄投影来自 @pi-studio/server 的 drive-assembly，
// 端点分发来自 api-routes——桌面壳**不重写**任何协议或端点语义。
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { SessionRegistry, openPiSession } from "@pi-studio/core";
import { browseApiDeps, registryDriveDeps } from "@pi-studio/server";
import { handleAppProtocol, registerAppScheme, APP_ORIGIN } from "./app-protocol.ts";
import { createIpcDriver } from "./ipc-driver.ts";
import { closeApiChannel, listenApiChannel } from "./api-channel.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** 特权 scheme 必须在 app ready 之前注册（Electron 的硬约束） */
registerAppScheme();

/** dev 形态：由编排脚本给出 vite 的地址（页面从 vite 加载，数据仍走 app:// 与 IPC） */
const DEV_URL = process.env.PI_STUDIO_DEV_URL?.trim() || undefined;

/** 生产形态的渲染层产物目录：打包内 app-dist 优先，仓库布局退而求其次 */
function resolveAppDist(): string {
  const candidates = [
    process.env.PI_STUDIO_APP_DIST,
    join(app.getAppPath(), "app-dist"),
    fileURLToPath(new URL("../../../app/dist", import.meta.url)),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate !== "");
  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (existsSync(join(abs, "index.html"))) return abs;
  }
  // 一个都没有（dev 形态正常）：返回首个候选，静态层会 404 而不炸
  return resolve(candidates[0] ?? app.getAppPath());
}

// ===== 组装：registry（core）↔ 控制层（IPC）双向引用以取值函数延迟求值 =====

let registry!: SessionRegistry;
const driver = createIpcDriver(
  registryDriveDeps(() => registry),
  ipcMain as unknown as Parameters<typeof createIpcDriver>[1],
);
registry = new SessionRegistry(openPiSession, (event) => driver.control.emit(event));

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    show: false,
    // 第一阶段保留 Windows 原生标题栏（ADR-0019 决定）；自绘窗框留作后续议题
    title: "Pi Studio",
    // 首帧前的窗口底色：取渲染层语义令牌 --bg-canvas 的浅色值（ADR-0001 表面阶梯的画布档）。
    // 窗口铬读不到 CSS 变量，只能把值抄过来；这里只盖「首帧闪白」那一瞬，
    // 主题切换后的真实底色由渲染层令牌接管。抄值须与 tokens.semantic.css 成对改。
    backgroundColor: "#faf9f5",
    webPreferences: {
      preload: join(HERE, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());

  // dev 专用加速键（见 Menu.setApplicationMenu(null)）：Ctrl+R 重载、F12 / Ctrl+Shift+I 开发者工具。
  // 这三条原本由默认菜单代劳，去掉菜单后必须显式补上，否则 dev 里就没法验证「重载重连」
  // 这条契约了。生产形态不挂这个钩子。
  if (DEV_URL) {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const key = input.key.toLowerCase();
      if (key === "f12" || (input.control && input.shift && key === "i")) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      } else if (input.control && !input.shift && key === "r") {
        win.webContents.reload();
        event.preventDefault();
      }
    });
  }
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = undefined;
  });

  // 桌面壳只承载自家页面：外链一律交给系统浏览器，禁止窗口内任意导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN);
    if (allowed) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  driver.bindWindow(win.webContents);

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${APP_ORIGIN}/`);
}

/**
 * dev 编排的父进程看门狗（只有 dev 形态会设这个环境变量）。
 * 存在的理由：Windows 上外部 kill 无法变成可捕获的 SIGINT（libuv 一律 TerminateProcess），
 * 故编排脚本的「退出即清理」不能只靠信号处理器。父进程一消失就自己退，保证不留孤儿窗口
 * ——否则下次 dev 会撞上单实例锁、被驱动的会话也无人释放。
 */
function watchDevParent(): void {
  const raw = process.env.PI_STUDIO_PARENT_PID;
  if (!raw) return;
  const parentPid = Number(raw);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;
  setInterval(() => {
    try {
      // signal 0：只探存在性，不投递
      process.kill(parentPid, 0);
    } catch {
      app.quit();
    }
  }, 3000).unref();
}

// ===== 进程生命周期 =====

// 单实例（ADR-0019）：与租约语义天然对齐——第二次启动聚焦既有窗口，不开第二个实例。
// 桌面壳的租约持有面就是「渲染进程存活期」，第二个实例只会自己撞上 serverBusy。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  watchDevParent();

  void app.whenReady().then(() => {
    driver.listen();
    // 无菜单栏：本壳没有能用菜单承载的命令（打开/保存/导出都不存在），Windows 原生标题栏
    // 已经承担窗口控制，默认菜单（File/Edit/View/Window）纯粹白占一行高度。
    // 代价：菜单自带的加速键随之消失——dev 下由 createWindow 的输入钩子补回 reload / devtools，
    // 生产形态不补（用户不该有开发者工具入口）。
    Menu.setApplicationMenu(null);
    // 浏览取数的两套传输（ADR-0019 补记一）：生产走 app:// 同源协议，
    // dev（页面在 vite 的 http 源）走 IPC——分发与载荷同一份（apiDeps 组装单源在 drive-assembly）。
    const apiDeps = browseApiDeps(registry);
    handleAppProtocol(apiDeps, resolveAppDist());
    listenApiChannel(ipcMain, apiDeps);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => app.quit());

  // 收尾：释放全部被驱动会话（属主随进程消亡；显式 dispose 让异步 dispose 有机会跑完）
  app.on("before-quit", () => {
    registry.disposeAll();
    driver.dispose();
    closeApiChannel(ipcMain);
  });
}

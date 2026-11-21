// dev 编排（ADR-0019）：一条命令起全套，不自作主张引编排依赖。
//   1. vite    —— 渲染层 HMR（页面从 http://localhost:<VITE_STUDIO_PORT> 供给）
//   2. esbuild —— main / preload 监听重建（workspace 源码内联、第三方 external）
//   3. electron —— 首次构建完成即起，之后 main/preload 每次重建自动重启（等旧进程退干净再起，
//                  否则会撞上单实例锁；app 源码改动不走重启，由 vite HMR 接管）
//
// 数据面与生产形态完全一致：页面里的取数走 preload 的 IPC 桥、驱动协议走 IPC 适配器，
// dev 下不启任何数据服务；vite 只是静态开发服务器。
//
//   pnpm dev:desktop
//
// 退出即级联清理：任一进程消失 → 全家退出，不留孤儿 electron / vite。
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { context } from "esbuild";
import { createServer } from "vite";

const DESKTOP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = join(DESKTOP_ROOT, "..", "..");
const APP_ROOT = join(REPO_ROOT, "packages", "app");
const require = createRequire(import.meta.url);

/** 渲染层 dev 端口：与 packages/app/vite.config.ts 共读一个变量，改端口只改这里 */
const DEV_PORT = Number(process.env.VITE_STUDIO_PORT ?? "5173");
const DEV_URL = `http://localhost:${DEV_PORT}`;

const log = (message) => console.log(`[dev] ${message}`);

// ===== esbuild：两个入口的监听构建（配置与 scripts/build.mjs 同源，差异只在 watch）=====

/** 只把 @pi-studio/* 打进产物，其余裸导入交给运行时的 node_modules（同 build.mjs） */
const workspaceOnly = {
  name: "bundle-workspace-only",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      const specifier = args.path;
      if (specifier.startsWith(".") || specifier.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(specifier)) {
        return undefined;
      }
      if (specifier.startsWith("@pi-studio/")) return undefined;
      return { external: true };
    });
  },
};

/**
 * 重建回调：两个入口各有一次**首次**构建，全部完成后才起 electron；
 * 之后的每次重建都重启 electron（250ms 防抖把同批两入口合成一次）。
 * 把「首次」按入口计数而不是一个布尔：单布尔会让第二个入口的首次构建
 * 被误判成「改动了」，于是刚起的窗口立刻又被重启一次。
 */
function makeRebuildHook() {
  let pendingInitial = 2;
  let timer = null;
  return {
    onEnd() {
      if (pendingInitial > 0) {
        pendingInitial -= 1;
        if (pendingInitial === 0) void startElectron();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        log("main / preload 重建完成 → 重启 electron");
        void restartElectron();
      }, 250);
    },
  };
}

const rebuild = makeRebuildHook();

const bundles = [
  [
    join(DESKTOP_ROOT, "src/main.ts"),
    join(DESKTOP_ROOT, "dist/main.js"),
    "esm",
  ],
  [
    join(DESKTOP_ROOT, "src/preload.ts"),
    join(DESKTOP_ROOT, "dist/preload.cjs"),
    "cjs",
  ],
];

function bundleOptions(entry, outfile, format) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    target: "node22",
    format,
    sourcemap: true,
    logLevel: "silent",
    plugins: [
      workspaceOnly,
      {
        name: "dev-rebuild-hook",
        setup(builder) {
          builder.onEnd(() => rebuild.onEnd());
        },
      },
    ],
  };
}

// ===== 进程编排 =====

let electron;
let restarting = false;
let shuttingDown = false;
let viteServer;
let esbuildContexts = [];

async function startElectron() {
  if (shuttingDown || electron) return;
  const binary = require("electron");
  electron = spawn(binary, ["."], {
    cwd: DESKTOP_ROOT,
    stdio: "inherit",
    // 父进程看门狗（Windows 的可靠性兜底）：外部 kill 在 Windows 上无法变成可捕获的
    // SIGINT（libuv 一律映射成 TerminateProcess），所以信号处理器不一定是最后一道保险。
    // 把父 pid 交给 main，由它轮询存活——编排脚本无论如何消失，electron 都会自己退出。
    env: { ...process.env, PI_STUDIO_DEV_URL: DEV_URL, PI_STUDIO_PARENT_PID: String(process.pid) },
  });
  electron.once("exit", (code) => {
    electron = undefined;
    // 用户关窗 / 崩溃 / 我们主动杀：只要不是重启中，就收摊
    if (!restarting && !shuttingDown) {
      log(`electron 退出（code=${code ?? "null"}）→ 关闭 dev 会话`);
      void shutdown(0);
    }
  });
  electron.once("error", (error) => {
    console.error(`[dev] electron 启动失败：${String(error)}`);
    void shutdown(1);
  });
  log(`electron 已启动 → ${DEV_URL}`);
}

/** 停 electron 并等它真正退出：单实例锁要求新旧进程不重叠 */
function stopElectron() {
  const child = electron;
  if (!child) return Promise.resolve();
  electron = undefined;
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once("exit", done);
    // 兜底：极端情况下 exit 事件可能已错过（进程已死），别让编排挂住
    setTimeout(done, 5000);
    child.kill();
  });
}

async function restartElectron() {
  if (shuttingDown || restarting) return;
  restarting = true;
  try {
    await stopElectron();
    await startElectron();
  } finally {
    restarting = false;
  }
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("收尾中……");
  await stopElectron();
  await viteServer?.close().catch(() => undefined);
  await Promise.all(esbuildContexts.map((ctx) => ctx.dispose().catch(() => undefined)));
  process.exit(code);
}

// ===== 主流程 =====

async function main() {
  esbuildContexts = await Promise.all(bundles.map(([entry, outfile, format]) => context(bundleOptions(entry, outfile, format))));
  await Promise.all(esbuildContexts.map((ctx) => ctx.watch()));
  log("esbuild 监听已启动（main / preload）");

  viteServer = await createServer({ root: APP_ROOT, configFile: join(APP_ROOT, "vite.config.ts") });
  await viteServer.listen();
  log(`vite 已就绪 → ${DEV_URL}`);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
// 编排脚本自己崩了也要带走子进程，否则 electron 会一直挂着
process.on("uncaughtException", (error) => {
  console.error("[dev] 未捕获异常：", error);
  void shutdown(1);
});

await main();

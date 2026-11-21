// 桌面壳的构建（ADR-0019）：esbuild 打两个入口，workspace 包源码内联、第三方依赖 external。
//
//   src/main.ts    → dist/main.js    （ESM，Electron 主进程；package.json 的 main 指向它）
//   src/preload.ts → dist/preload.cjs（CJS 单文件，沙箱化 preload 的硬要求）
//
// 「只内联 workspace」是 adr 明写的产物策略：pi SDK（@earendil-works/*，含 quickjs-wasi 等
// 运行时资源）整包 external、随 node_modules 进 asar，避免把 wasm / 动态 require 路径
// 塞进单文件 bundle；而 core / server / shared 是我们的源码，编进产物才不会在运行时
// 依赖 TypeScript 源码的可加载性（本包导出的是 .ts）。
//
//   node packages/desktop/scripts/build.mjs            一次性构建
//   node packages/desktop/scripts/build.mjs --watch    监听重建（dev 编排用）
import { build, context } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "dist");
const watch = process.argv.includes("--watch");

/** 只把 @pi-studio/* 打进产物，其余裸导入一律交给运行时的 node_modules */
const workspaceOnly = {
  name: "bundle-workspace-only",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      const specifier = args.path;
      const isRelative = specifier.startsWith(".") || specifier.startsWith("/");
      const isDrivePath = /^[a-zA-Z]:[\\/]/.test(specifier);
      // 相对/绝对路径照常解析（esbuild 默认行为）
      if (isRelative || isDrivePath) return undefined;
      // workspace 源码：内联（走各包 package.json 的 exports，指向 .ts 源文件）
      if (specifier.startsWith("@pi-studio/")) return undefined;
      // 其余（node: 内建、electron、@earendil-works/* 及其传递依赖）全部 external
      return { external: true };
    });
  },
};

/** 两个入口共用：ES2022 / node 平台 / 带 sourcemap（dev 里断点落在 .ts 源上） */
function common(entryPoints, format, outfile) {
  return {
    entryPoints,
    outfile: join(OUT, outfile),
    bundle: true,
    platform: "node",
    target: "node22",
    format,
    sourcemap: true,
    logLevel: "info",
    plugins: [workspaceOnly],
  };
}

const options = [
  common([join(ROOT, "src/main.ts")], "esm", "main.js"),
  common([join(ROOT, "src/preload.ts")], "cjs", "preload.cjs"),
];

if (watch) {
  const contexts = await Promise.all(options.map((option) => context(option)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("[desktop] esbuild watch 已启动");
} else {
  await Promise.all(options.map((option) => build(option)));
  console.log("[desktop] 构建完成 → dist/main.js · dist/preload.cjs");
}

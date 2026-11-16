// 令牌引用检查（ADR-0001 的机器执行）：组件 CSS 里每个 var(--x) 都必须有定义。
// 浏览器对未定义的自定义属性**静默失败**（回退到继承值），typecheck 与测试都看不见，
// 故单独做一道确定性检查。接入 pre-commit 与 CI。
//
//   node scripts/check-css-tokens.mjs
//
// 扫描范围：packages/app/src 下全部 .css（含 CSS Modules 的自定义属性）。
// 允许的未定义引用：RUNTIME_INJECTED（由第三方库在运行时注入）。
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "packages/app/src");

/** 运行时由库注入、静态扫描看不到的令牌（写清来源，避免变成杂物袋） */
const RUNTIME_INJECTED = new Set([
  "--shiki-dark", // shiki 双主题模式下由 shiki 在 <pre> 上按主题注入
]);

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (extname(path) === ".css") out.push(path);
  }
  return out;
}

const files = cssFiles(SRC);

// 一遍收集定义（--x: 任意值），一遍收集引用（var(--x）
const defined = new Set();
for (const file of files) {
  for (const match of readFileSync(file, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    defined.add(match[1]);
  }
}

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      const token = match[1];
      if (defined.has(token) || RUNTIME_INJECTED.has(token)) return;
      problems.push(`${relative(ROOT, file)}:${index + 1}  未定义令牌 ${token}`);
    }
  });
}

if (problems.length > 0) {
  console.error(`CSS 令牌检查失败（${problems.length} 处）：`);
  for (const problem of problems) console.error("  " + problem);
  console.error("\n修法：改用 styles/tokens.* 里已定义的令牌，或在 tokens.primitives.css 补上定义。");
  process.exit(1);
}

console.log(`CSS 令牌检查通过（${files.length} 个文件 · ${defined.size} 个令牌定义）`);

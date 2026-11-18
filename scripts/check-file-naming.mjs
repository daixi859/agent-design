// 文件命名检查：组件 .tsx 与导出的组件同名（PascalCase），其余 .ts 一律 kebab-case。
// 纯约定没有机器兜底就会漂移（此前 state/ 里 hook 文件两套写法并存），故单独做一道
// 确定性检查。接入 pre-commit 与 CI。
//
//   node scripts/check-file-naming.mjs
//
// 扫描范围：packages/*/src 下全部 .ts/.tsx。.ts 按点分段逐段校验
// （catalog-cache.test.ts → catalog-cache / test），天然覆盖 *.test.ts、*.d.ts。
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = join(ROOT, "packages");

// kebab：小写字母数字段、段间连字符（test、d 这类单段也命中）
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// PascalCase：大写字母开头，其余字母数字（组件文件名段）
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
// 打包器入口惯例名（由 index.html 等构建配置引用，不是组件）
const ENTRY_NAMES = new Set(["main", "index"]);

function tsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(path));
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const problems = [];
let count = 0;
for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
  const src = join(PACKAGES, entry.name, "src");
  if (!entry.isDirectory() || !existsSync(src)) continue;
  for (const file of tsFiles(src)) {
    count++;
    const segments = relative(ROOT, file).split(/[\\/]/).pop().replace(/\.tsx?$/, "").split(".");
    if (file.endsWith(".tsx")) {
      // 组件文件：首段 PascalCase（如 Foo.tsx），其余段 kebab（预留 Foo.test.tsx）；入口名豁免
      if ((!PASCAL.test(segments[0]) && !ENTRY_NAMES.has(segments[0])) ||
        segments.slice(1).some((s) => !KEBAB.test(s))) {
        problems.push(`${relative(ROOT, file)}  组件文件应与导出组件同名（PascalCase）`);
      }
    } else if (!segments.every((s) => KEBAB.test(s))) {
      problems.push(`${relative(ROOT, file)}  非 kebab-case（应作 use-locale.ts 式命名）`);
    }
  }
}

if (problems.length > 0) {
  console.error(`文件命名检查失败（${problems.length} 处）：`);
  for (const problem of problems) console.error("  " + problem);
  console.error("\n规则：组件 .tsx 与导出的组件同名（PascalCase）；其余 .ts 一律 kebab-case。");
  process.exit(1);
}

console.log(`文件命名检查通过（${count} 个文件）`);

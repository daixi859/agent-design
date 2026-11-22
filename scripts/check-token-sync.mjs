// dsh-ui 令牌快照一致性检查：packages/dsh-ui/src/styles/tokens.ui.css 是 app 两层
// 令牌（styles/tokens.primitives.css / tokens.semantic.css）的手工值快照——独立成
// 文件使 dsh-ui 不依赖宿主包，上游改值靠人工同步。本脚本把「人工同步」变成守门：
// 快照里的每个令牌必须在 app 令牌层同名、同主题块地存在且值一致（剥注释、空白
// 归一后逐字比对）；快照令牌在 app 侧消失也判红（提示修剪快照）。
//
//   node scripts/check-token-sync.mjs
//
// 只比对快照声明过的令牌（快照是子集，app 多出的令牌不管）；
// tokens.dsh.css 的 --dsh-* 快照是 DSH 样张专用陈列值，不参与（见该文件头注释）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SNAPSHOT = join(ROOT, "packages/dsh-ui/src/styles/tokens.ui.css");
const APP_TOKENS = [
  join(ROOT, "packages/app/src/styles/tokens.primitives.css"),
  join(ROOT, "packages/app/src/styles/tokens.semantic.css"),
];

/** 剥注释后把 css 拆成主题块（:root → light，[data-theme="dark"] → dark），
 *  同名块合并，返回 { light: Map, dark: Map }；值做空白归一。
 *  块体匹配假定无嵌套花括号——令牌文件不写 @media/@layer，将来加层时此解析需重看 */
function parseTokenBlocks(file) {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = { light: new Map(), dark: new Map() };
  for (const [, selector, body] of text.matchAll(/(:root|\[data-theme="dark"\])\s*\{([\s\S]*?)\}/g)) {
    const map = selector === ":root" ? blocks.light : blocks.dark;
    for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      map.set(name, value.replace(/\s+/g, " ").trim());
    }
  }
  return blocks;
}

const snapshot = parseTokenBlocks(SNAPSHOT);
const app = { light: new Map(), dark: new Map() };
for (const file of APP_TOKENS) {
  const blocks = parseTokenBlocks(file);
  for (const theme of ["light", "dark"]) {
    for (const [name, value] of blocks[theme]) app[theme].set(name, value);
  }
}

const problems = [];
for (const theme of ["light", "dark"]) {
  for (const [name, value] of snapshot[theme]) {
    const upstream = app[theme].get(name);
    if (upstream === undefined) {
      problems.push(`${theme} · ${name}  快照有值（${value}），app 令牌层已无此令牌——修剪快照`);
    } else if (upstream !== value) {
      problems.push(`${theme} · ${name}  快照 ${value} ≠ app ${upstream}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`dsh-ui 令牌快照与 app 令牌层漂移（${problems.length} 处）：`);
  for (const problem of problems) console.error("  " + problem);
  console.error(
    "\n修法：以 app 的 tokens.primitives.css / tokens.semantic.css 为准同步快照，或修剪快照中已消亡的令牌。",
  );
  process.exit(1);
}

const count = snapshot.light.size + snapshot.dark.size;
console.log(`dsh-ui 令牌快照与 app 令牌层一致（${count} 个定义逐项比对）`);

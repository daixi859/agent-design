# Pi Studio · AGENTS.md

pi 内核本机 session 数据的只读查看器（React + Vite + CSS Modules），处于高保真设计验收阶段；内核接入（Drive / Attach，ADR-0012）进行中，仓库已改 pnpm workspace。

## 术语

代码、注释、UI 文案用到 Session、Turn、Tool Group 这类领域词时，以 [GLOSSARY.md](GLOSSARY.md) 为准；术语在讨论中定案就当场收录，发现两种说法打架，先改词汇表再改代码。界面文案经 i18n 双语（ADR-0011）：英文是源语言，词条在 `packages/app/src/lib/i18n.ts`，新增文案 en/zh 两侧同步；代码注释一律中文。

## 决定记录

[docs/adr/](docs/adr/) 按编号收录视觉与结构决定；改动会触碰某条既有决定时，先读对应 ADR 再动手。新决定满足三条才补 ADR：难以逆转、缺上下文会令人意外、当时确有取舍——缺一则不写。

## 样式与渲染

- 组件样式一律引用语义层变量（`--bg-*`、`--text-*`、`--code-*`…），颜色与间距不硬编码；令牌分三层、主题只在语义层切换（ADR-0001）。`var(--x)` 引用未定义令牌时浏览器静默失败，故由 `scripts/check-css-tokens.mjs` 兜底（已接钩子与 CI）。
- 动代码面（markdown 代码块 / toolArgs / toolOutput / diff，统一表面语言与头部栏）前读 ADR-0007；改渲染层级或新增 Entry 类型前读 ADR-0004 与 ADR-0006。

## 数据与 API

`packages/shared` 为同构层（pi 数据类型 + 纯文本逻辑），`packages/core` 是驱动内核接入层（传输无关），`packages/server` 只做文件访问、JSONL 解析与 HTTP/WS 传输，领域逻辑放 `packages/app/src/lib`，pi 数据类型进 `packages/shared/src/pi-types.ts`，客户端统一经 `packages/app/src/lib/pi-client.ts` 取数。

只读边界已由 ADR-0012 修订：浏览路径（REST + Live Tail）保持只读，而被 Attach 的 session 可被驱动，输入区**已是功能件**（原 ADR-0002 的只读约束仅对浏览路径有效）。

`packages/server`（及后续内核接入层 core）在 Node 原生 type-stripping 下直跑：相对导入一律带 `.ts` 扩展名，只用可擦除语法（无参数属性、enum、namespace）。

## 环境与验收

```
node node_modules/typescript/bin/tsc -b   # 类型检查（根 tsconfig 引用四个包）
node node_modules/vitest/vitest.mjs run   # 测试（从根扫描全部包）
node scripts/check-css-tokens.mjs         # 样式令牌：var(--x) 必须有定义
node packages/server/src/main.ts          # 独立 server（REST /api · WS /ws，裸 node 直跑）
node node_modules/vite/bin/vite.js packages/app   # dev server，/api 与 /ws 代理到 server 进程
```

依赖管理用 pnpm（lockfile 以 `pnpm-lock.yaml` 为准，勿引 npm）；提交守门钩子需每 clone 配置一次：`git config core.hooksPath githooks`（CI 在 GitHub Actions 跑同样的三道：typecheck、test、check:css）。

完成判据：任何改动交付前上面前三道检查全绿；视觉改动另加 dev server 截图自检浅、深两主题通过，并在交付说明里写下截图路径（否则跳过不可见）。

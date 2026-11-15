# Pi Studio · AGENTS.md

pi 内核本机 session 数据的只读查看器（React + Vite + CSS Modules），处于高保真设计验收阶段。

## 术语

代码、注释、UI 文案用到 Session、Turn、Tool Group 这类领域词时，以 [GLOSSARY.md](GLOSSARY.md) 为准；术语在讨论中定案就当场收录，发现两种说法打架，先改词汇表再改代码。UI 文案一律英文，代码注释一律中文。

## 决定记录

[docs/adr/](docs/adr/) 按编号收录视觉与结构决定；改动会触碰某条既有决定时，先读对应 ADR 再动手。新决定满足三条才补 ADR：难以逆转、缺上下文会令人意外、当时确有取舍——缺一则不写。

## 样式与渲染

- 组件样式一律引用语义层变量（`--bg-*`、`--text-*`、`--code-*`…），颜色与间距不硬编码；令牌分三层、主题只在语义层切换（ADR-0001）。
- 动代码面（markdown 代码块 / toolArgs / toolOutput / diff，统一表面语言与头部栏）前读 ADR-0007；改渲染层级或新增 Entry 类型前读 ADR-0004 与 ADR-0006。

## 数据与 API

`server/` 只做文件访问与 JSONL 解析，领域逻辑放 `src/lib`，新类型进 `shared/pi-types.ts`，客户端统一经 `src/lib/pi-client.ts` 取数。API 保持只读，输入区是视觉件而非功能件（ADR-0002）。

## 环境与验收

本机 shell 的 fnm 钩子在进入项目目录时以非零退出中断 `&&` 命令链，npx 同样不可用：命令一律从仓库根直接执行（工作目录默认就是根），用内置 Node 跑：

```
node node_modules/typescript/bin/tsc -b   # 类型检查（package.json 的 typecheck）
node node_modules/vite/bin/vite.js        # dev server，只读 API 挂在 /api 前缀
```

完成判据：任何改动交付前 `tsc -b` 干净；视觉改动另加 dev server 截图自检浅、深两主题通过。

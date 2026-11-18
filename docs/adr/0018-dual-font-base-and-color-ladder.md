# 字号双基准与颜色档距：语义层只留可感知的档

验收反馈：字号太多、颜色梯度不清——thinking/text-2/text-3 挤在同一亮度带（ΔE ≤ 2.9，不可分），`--bg-sidebar` 与 `--bg-inset` 两主题字面同值却挂两个名字。全库盘点（Lab ΔE 实测）：字号名义 9 档 + 内容轴 2 档 + 1 处裸 `em`；语义层 55 个颜色令牌里有 5 组字面重复、7 个零引用死令牌。增长模式是「加令牌」而不是「拉开档距」。决定把语义层收敛为**可感知的档**：一类信息一个值，做梯度就必须拉开。

## 决定

**字号双基准**（原始值层）

- 全库只有两个基准：`--text-base: 14px`（标准字号）与 `--text-code: 12px`（代码字号）。
- 其余档位一律 `calc()` 由基准推出（`--text-footnote: calc(var(--text-base) - 1px)` 等），改基准全档联动；`--text-caption` 即代码字号。
- **代码字号不派生**：行内代码（原 `0.86em`）与代码块 `<pre>` 固定 `--text-caption` 12px，不随 `--content-font-size` 内容轴缩放；代码块 banner 语言标签保持 11px（caption2 = 代码 −1 的密集元数据档）。
- 代码块 `<pre>` 字号 11 → 12（修订 ADR-0013 从 DSH 钉下的 `11px·19px` 为 `12px·19px`）。
- 零引用档删除：`--text-title1` 与 `--leading-callout/title2/title3/title1`；存留行高一律 `calc(对应字号 + 呼吸值)`。

**颜色一类一档**（语义层）

- 灰字四档：`--text-1`（主文）/ `--code-text`（代码与 TUI 正文）/ `--text-2`（次级文本 + 信息性元数据，吸收原 text-3 / thinking / tui-dim）/ `--text-4`（装饰性淡字，吸收 tui-faint）。TUI 不再私有色，引用共享档。
- 赤陶文字档合一：`--accent-text` 承接焦点环（原 `--focus-color`）与 TUI 运行态（原 `--tui-run`）；`--accent-hover` 零引用，删除。
- 表面阶梯：elevated / canvas / inset（下沉面）/ code / bubble。`--bg-sidebar` 降为位点别名（`var(--bg-inset)`）；`--bg-active` 并入 `--bg-selected`（alpha .08→.11 / .10→.13，与 hover 拉开）；`--inline-code-bg` 并入 `--code-bg`；暗主题下沉面与代码面同档（`--code-bg: var(--bg-inset)`，macOS 深铬惯例），取值 #1f1e1d → #1a1918。
- 档距调值：浅色 `--code-bg` #eceae1 → #e7e4d6（与下沉面 ΔL* 1.4 → 3.5）、`--bubble-user-bg` #e8e6dc → #e0dccc。
- **档距规则**：同主题同类令牌相邻档 表面 ΔL* ≥ 3、文字 ΔL* ≥ 10；信息性文字 ≥ 4.5:1（WCAG AA），`--text-4` 仅限装饰。唯一例外是浮层 `--bg-elevated`：浮层身份由阴影 + 发丝环承载，不占 L 梯度（macOS 惯例）。达不到档距的两个值必须合并，不允许第三档挤进同一亮度带；别名仅当两名指称不同角色（位点/角色，注释声明身份）才保留，同角色不同名一律删除。

## 考虑过的选项

- **引入完整灰阶色板（50–900 式）**：否——UI 没有那么多可感知的信息层级；档距规则让「加一档」必须先证明区分度。
- **旧令牌名留 alias 分批迁移**（`--text-3: var(--text-2)`）：否——「两个名字一个值」正是本次要治的病灶；39 处引用机械替换一次到位（`--bg-sidebar`、`--diff-*-marker` 除外，它们是位点/角色别名，有独立语义职责）。
- **代码字号跟随内容轴缩放**（保留 `0.86em`）：否——代码块与行内代码固定 12px 是双基准的一部分；缩放跟随会让「代码字号」失去定义。

## 后果

- 语义层删 15 个令牌：`--text-3`、`--thinking`、`--thinking-subtle`、`--tui-text/dim/faint/run`、`--inline-code-bg`、`--bg-active`、`--bg-detail-pane`、`--detail-pane-width`、`--accent-hover`、`--on-accent`、`--danger-subtle`、`--focus-color`；原始值层另删 5 个死档（`--text-title1` 与 `--leading-callout/title2/title3/title1`）。
- 全库引用已机械替换（约 60 处，15 个文件）；`check-css-tokens` 钩子照旧兜底未定义引用。
- TUI 行内秒数对比度 2.4 → 2.9/3.2:1（并入 text-4 的收益）；灰字元数据档 4.64 → 5.15:1（text-2 取深值）。
- 修订 ADR-0007 的代码面浅色取值（#eceae1 → #e7e4d6）与 ADR-0013 的代码块字号钉值（11 → 12px·19px），两者原文已加修订注记。
- 范围外一致性修复（依 ADR-0007「代码面随主题」）：dark 下 Shiki `pre` 的内联亮色背景从未被覆盖（双主题只切了字色），补 `background: var(--code-bg) !important`——修复前深色代码块一直白底。
- 字号轴机关不变：`--content-font-size` 只管正文与次级两档，代码面恒定。

# Transcript 借 DeepSeek 的几何与结构重绘，配色仍走暖纸赤陶

验收反馈要求 transcript「用 DeepSeek 风格重画」。对照 `docs/research/dsh-transcript-notes.md`（DSH 渲染代码 + 令牌实证）与 `docs/research/pi-kernel-notes.md`（pi 内核数据类型实证，本机 1407 行真实会话交叉验证）后决定：**移植 DSH 的结构与几何，不移植它的调色板**。

## 决定

**结构与几何（照搬）**

- **单一列宽轴**：`--content-measure` 由常数 760px 改为 `clamp(680px, 列宽 × 0.64, 920px)`；用户气泡宽度上限由内容列宽 × 0.702 派生。取代三处各自为政的宽度常量。
- **四轴动态字号**：新增 `--content-font-size`（正文，默认 14px）与 `--content-font-delta`，行高一律写 `calc(基础行高 + delta)`；正文与次级（正文 −1/−2）两档跟随。为后续「设置里调字号」留出唯一机关，本次先不做滑块。
- **工具行取代工具卡**：`[16px 图标盒] 6 [工具名 13/24] 8 [2×2 圆点] 8 [摘要截断]` 的 disclosure 行，整行可点、Enter/Space 切换、`aria-expanded`；hover 时图标交叉淡入 chevron。展开体缩进 `4px 0 4px 4px`。**不再用圆角卡片包住工具行**。
- **状态只走文字色**：运行中 / 取消用 tertiary，失败用 danger；不引入彩色状态徽标。耗时移出工具行。
- **思考块**：tertiary 灰、次级字号、无斜体、无左边框侧线；展开体缩进与标题对齐。
- **终端块左侧 30px gutter** 放状态点，命令与输出同块；输出默认 `pre` 不换行、内滚。
- **diff** 整行铺色 + `inset 3px 0 0 marker` 竖条；`+` / `-` 两字符前缀。

**配色（不照搬）**

画布、强调、气泡、代码面继续用现有语义层（暖纸画布 + 赤陶强调，ADR-0005 不变）。DSH 的近单色 + 蓝链接与赤陶冲突，一起换会波及 Sidebar / Settings / 按钮，收益只是「更像」，代价是推翻一条已验收的视觉决定。平移的只有 DSH 缺而我们没有的那一档：**diff 的 bg/gutter/marker 分档**（`--diff-*-bg/gutter/marker`）。`--text-caption` 与 `--border-hairline` 在本次改动前就已存在，不是新增。所有取值按暖纸色温重取。

**数据对齐（pi 语义）**

- **Recap 取代两级折叠条**：**每个 Process Group 一条 Recap**（`M 工具 · K 思考 · 失败数 · 耗时 · tokens`），展开后是 Process Strip。原「轮聚合条 + 组条」两级折叠收敛为一级——长工具链会话多一层折叠纯属噪音。Recap 的结算事实由模型层算出（`GroupRecap` 与 `Turn.durationMs`/`tokens`/`draft`）；内核没给 usage 就不报 tokens，不发明数据。
- **diff 一律用内核产出的 `details.diff`**（带行号，`edit-diff` 生成），客户端不自己算；`details.patch` 仅供复制/导出。`edits[].oldText/newText` 与历史顶层 `oldText/newText` 两种形态都要兼容。
- **Draft 与落盘条目在 Recap 中可区分**：流式草稿是瞬态叠加（ADR-0012 已有），权威条目落盘后整段让位。
- **bash 无 stdout/stderr 分离且含 ANSI**，终端块按原样呈现，不做流分离。

## 考虑过的选项

- **全量切 DeepSeek 调色板**：被否——需要修订 ADR-0005，波及整个 app 的已验收观感，而「DeepSeek 风格」在此处的信息收益主要在结构与几何。
- **保留现有卡片式工具卡、只调字号间距**：被否——卡片包裹是当前对话区最重的视觉噪音来源，DSH 的极简行正是要解决的问题。
- **一次做完交互（字号滑块、列宽拖拽）**：被否——先落静态结构，交互参数留好机关即可。

## 范围外补充（落地时一并做了，超出本 ADR 的决定清单）

- **代码块几何对齐 DSH**（`Markdown.tsx`：sticky `codeBannerWrap` + `codeBanner` + `codeContent`，复制确认时长 1000ms，新增 `--leading-code*`）。本 ADR 只决定「代码面沿用 ADR-0007 的统一表面语言」，未要求重排代码块；此项是同一轮里按 `dsh-transcript-notes.md` 顺手对齐的，事后记此以免误认为清单内条目。**2026-11 修订（ADR-0018）**：`<pre>` 字号 11 → 12px（`12px·19px`，代码字号双基准 `--text-caption`），banner 语言标签保持 11px。
- **用户消息时钟行**（`MessageViews.tsx` + `clock` 图标）：与 ADR-0006「时间移出正文流」不冲突（时间是消息体的附属标注，不是页脚），但同样不在本清单里。

## 后果

- `GroupSection` / `stepsBar` / `groupBar` / `toolCard` / `.thinking` 卡片样式退役；新增 Recap、Process Strip、Tool Row、Terminal Block、Diff Row 五组组件与样式。旧 `ToolCallCard` / `DiffView` 整件退役（解析逻辑迁入 `lib/edit-diff.ts`）。
- **真实渲染路径已切换**（本 ADR 落地末步）：`TranscriptModel` 的 `GroupItem` 增加 `state`（四态）与 `subCalls`（内核 `details.calls`），`terminal` 由模型层按工具名归一——**视图层不再维护工具名清单**；`Turn.abandonedCount` 只挂首个 Turn，避免每轮重复标注。`TurnView` 收敛为一级折叠（每 Process Group 一条 Recap）。
- **静态验收走 Settings 的对话区分区**：`TranscriptLab` 的 mock 只产出**真实 SessionEntry**，经 `buildTranscriptModel` 走完整真实路径渲染——样张不再有复刻组件，退化为纯清单排版。
- `--content-measure` 的取值改为表达式后，`Transcript` 根用 ResizeObserver 发布 `--pane-width`，否则退回 760px 兜底。
- 字号轴只发布不消费滑块的 UI；将来加滑块时只改 `--content-font-size` 一个值。
- **行内状态只走文字色**，四态各自成类（`.stateRunning`/`.stateOk`/`.stateError`/`.stateStopped`），由 `ToolRow.tsx` 的一张 `STATE_VIEW` 表统一驱动标签、字形与类名；**终端块的 gutter 状态点（`RunDot`）是本 ADR 明列的例外**，保留分档颜色（DSH StateDot 的最小版）。
- 术语「Tool Group」随之改名 **Process Group**（GLOSSARY），因为折叠层级不再有三层。

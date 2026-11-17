# 输入框重设计 · 源码调研（pi × deepseek-harness × 本仓库）

- 日期：2026-11-17 · 分支：ccstyle
- 方法：三个只读探索代理分别通读三个仓库的输入框相关源码，本文为其报告的整合与对照；所有路径均为一手来源。
- 用途：喂给输入框重设计的盘问（/grill-with-docs），不是规格说明。

## 0. 结论速览

1. 需求里的「模型/thinking 切换」「上下文环」「队列行内操作」三件，**都卡在协议边界上**：`DriveCommandBody` 只有 prompt/steer/followUp/abort（ADR-0012 明确推迟了 setModel/setThinkingLevel）；context window 大小在任何一层都不存在；队列内容只有只读视图。而 pi 内核（`AgentSession`）本身就有 `setModel / setThinkingLevel / cycleModel / getAvailableThinkingLevels / getContextUsage`，core 接缝加方法即可，不是内核层改造。
2. 上下文环的参照实现是 dsh 的 `ContextMeter`（14px SVG 环 + 点击/hover 详情面板 + system/tools/messages 分段条）；pi 走的是 footer 百分比 + 70%/90% 阈值变色、无明细。本仓 `UsageInfo` 只有 input/cacheRead/cacheWrite/output，**system/tools 明细桶两边的内核口径不同，明细条可能做不出来**，盘问点。
3. 队列交互的参照实现是 dsh 的 `QueueDock`：输入框上方、行内 Edit / Remove / Steer now（=「追加行立即发送」）、多条折叠计数头、编辑时自动展开——与需求逐字吻合。
4. 「去掉工具数量、运行状态、追加」之后，运行态的表达由三件东西接管：Stop 按钮（dsh：tooltip 标出 Esc,Esc）、占位符随状态切换（dsh）、Transcript 内已固定的运行组（ADR-0014 TUI 模式已有；Standard 模式运行组本来就在流里）。retry/compacting 两个状态仍需一个去处。

## 1. 参照系一：pi TUI（E:\workspace\github\pi）

架构分工：`packages/tui`（通用 TUI 框架）+ `packages/coding-agent`（agent 与交互模式）。无 web UI，但组件分层可直接映射到 web。

### 1.1 编辑器（`packages/tui/src/components/editor.ts`，2483 行；`packages/coding-agent/src/modes/interactive/components/custom-editor.ts`）

- 多行编辑，Enter 提交 / Shift+Enter（或 Ctrl+J）换行；编辑器高度自适应 `max(5, 终端行数×30%)`，内部滚动带 `↑N more / ↓N more` 边界提示。
- 历史：`addToHistory()`（上限 100、连续去重），↑/↓ 导航，进入历史时以 `historyDraft` 保住正在编辑的草稿。
- 大粘贴标记：>10 行或 >1000 字符折叠为原子 token `[paste #1 +123 lines]`，按单个字素参与光标/删除/换行，提交时展开回全文。
- IME：伪光标前发零宽硬件光标标记让候选框定位正确；`Intl.Segmenter` 全程字素分割。
- 外部编辑器 Ctrl+G（web 不适用）。kill ring、undo、emacs 键位、鼠标点定位（web 大多原生自带）。
- **编辑器边框颜色编码 thinking level 与 bash 模式**；顶边框内嵌 `Working (Esc to interrupt)` + spinner，变体有 Retry（带倒计时）/ Compaction / BranchSummary 状态条。

### 1.2 斜杠菜单与补全（`packages/tui/src/autocomplete.ts`；菜单原语 `components/select-list.ts`）

- 行首 `/` 触发（仅第一行），实时模糊过滤，描述列显示 `argumentHint — description` 与来源标签（`[p:npm:pkg]` / `[u]`）。
- 命令源 = 24 个内建（`packages/coding-agent/src/core/slash-commands.ts`）+ prompt 模板 + 扩展命令 + 可选 `skill:<name>`。
- **参数补全**：命令可定义 `getArgumentCompletions(prefix)`，`/model`（provider/id 模糊）、`/thinking`（档位）、`/login` 已接。
- 菜单停靠在输入框下沿（非浮动 popover）；↑/↓ 循环、PgUp/PgDn 翻页、Tab/Enter 接受，Enter 在斜杠前缀下会**穿透为直接提交**；唯一匹配时 Tab 静默补全。
- `@` 文件提及：fd 模糊搜索（尊重 .gitignore、支持引号路径、目录尾 `/`、前 20 名）；与 `/`、Tab 路径补全共用同一个菜单。

### 1.3 模型与 thinking 选择（`components/model-selector.ts` 439 行、`thinking-selector.ts`）

- Ctrl+L 开模型选择器（搜索框 + 10 行窗口列表 + ✓ 当前 + `· default` 标 + `(n/total)`）；Enter 只选会话级，**Ctrl+S 选并持久化为默认**（`session.setModel(model, {persist:true})`）。
- Ctrl+P / Ctrl+Shift+P 在「scoped models」集合内正反循环；Shift+Tab 循环 thinking 档位；`/model <query>`、`/thinking <level>` 直达。
- thinking 选择器带档位描述（`off: No reasoning` … `max`），每模型可用档位来自 `getAvailableThinkingLevels()`。
- footer 右侧常驻 `model-id • <thinkingLevel>`；边框颜色同步档位；切换时发瞬态状态行。

### 1.4 上下文用量（`core/agent-session.ts` getContextUsage；footer）

- 算法：扫 entries 取**最后一条 assistant usage**（input + cacheRead + cacheWrite）；compaction/context_edit 之后失效，退化 chars/4 估算；`percent = tokens/contextWindow×100`。
- 展示：`12.3%/200k`，**>70% 黄、>90% 红**，auto-compact 开启时缀 ` (auto)`；compaction 后到下次真实 usage 前显示 `?/200k (auto)`。
- auto-compact 阈值：`tokens > contextWindow - reserveTokens`，reserve 默认 **16384**。
- 无环/条、无明细桶——纯文本百分比。

### 1.5 运行中发送（steer / followUp / 队列）

- 运行中 Enter → `prompt(text, {streamingBehavior:"steer"})` 进 steering 队列，当前 assistant 轮 + 工具调用结束后投递。
- Alt+Enter（Win: Ctrl+Q）→ followUp：仅在 agent 本来要停时投递。
- **待发显示**：dock 中输入框上方的容器渲染暗色 `Steering: <text>` / `Follow-up: <text>` 截断行 + 提示 `↳ Alt+Up to edit all queued messages`。
- **Alt+Up**：把全部队列（steering + followUp）按空行拼接还原回编辑器并清空队列（整批改完重发）；**运行中 Esc** = 同样的还原 + 中止运行。无逐条编辑。
- compaction 期间输入进本地缓冲，结束后 flush。

### 1.6 编辑历史消息 / fork

- **没有就地编辑已发送消息**。双 Esc（空编辑器、500ms 内）→ 会话树或 fork 选择器（设置项 `doubleEscapeAction`，默认 tree）。
- `/fork`：列出全部历史 user 消息，选中即把该点之前的路径复制成**新 session 文件**，并把消息文本放回编辑器。

### 1.7 其它

- `!` bash 模式（`!!` 不进上下文）；Ctrl+V 粘贴优先级：复制的文件路径 → 图片（写临时 png 插路径）→ 文本；无独立中断按钮（Esc 即中断）；无内建工具审批（扩展可 veto）；`/hotkeys` 往 transcript 打键位表；Ctrl+Shift+F 全屏搜索。

## 2. 参照系二：deepseek-harness web UI（E:\workspace\github\deepseek-harness）

架构：everything-is-a-plugin（Cordis IoC）；前端 React 19 + Vite，编辑器 **Lexical**，状态为可观察 `SnapshotStore` 经 `useSyncExternalStore` 桥接，样式 CSS Modules。输入框几乎全部在 `packages/client/ui-conversation`，卫星插件 `ui-commands` / `ui-skill` / `ui-reference` / `ui-input-trigger` / `ui-model-selection` / `ui-primitives`。

### 2.1 Composer（`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`、`input/` 目录）

- contenteditable 多行，CSS 封顶 14 行后内部滚动；草稿边缘滚轮链接到会话滚动口。
- Enter 提交 / Shift+Enter 换行；**按住 Enter（event.repeat）吞掉防连发**；**Ctrl/Cmd+Enter = 「互补动作」**：翻转 busy 偏好（Queue ↔ Steer）；运行中且草稿为空时 Ctrl+Enter = **把整个队列 steer 进当前轮**。
- **Esc 分层**：先关弹层；命令 chip 存在时 Esc 不释放（删 chip 才是出口）；**Esc, Esc 双击（500ms 窗口，可配）= 中断当前轮**，且**保留队列**。
- IME：`isComposing || keyCode===229` 守护 + Safari `compositionend` 后 10ms 保护窗 + 根元素 `data-composer-composing` 属性。
- 粘贴：文本走净化插入（独立 undo 边界）；文件/图片由 document 级路由到最近聚焦的 composer，intake 预检（张数/字节/总量上限）toast 拒绝。
- **草稿持久化**：语义快照（文本 + 引用 chip + 命令 token + 引用块）zod 校验后存 `localStorage["dsh.conversation.<sessionId>"]`，恢复时 chip 异步重解析、不抢焦点。
- **发送状态机**（纯函数 `input/machine.ts` + 外壳 `input/facade.ts` 883 行）：`plain → adjudicating → claimed（命令 chip）→ submitting → sending`；后三阶段冻结编辑，失败草稿原样归还；发送中按钮转 spinner「Sending」；commit 时切断 Lexical 历史防「已发内容复活」。
- 占位符随状态切换：默认「Describe a task… `/` commands, `@` files」/ plan 模式文案 / **队列可整批 steer 时换成 steerQueue 提示** / 不可用态。命令 chip 后有参数 ghost hint。
- 引用：transcript 选中文本可插入为原子 blockquote chip。

### 2.2 触发菜单（`packages/client/ui-input-trigger` + 各源插件）

- 从光标向后扫描触发：`/` 只在行首/空白/标点边界且挖了 URL 例外（`https:/`、`//`）；`@` 支持跨空白引号 token。
- 菜单 reducer：按源分组、stale-while-revalidate（ refining 时保留旧行加骨架）、全空自动关、键盘 `move` 与指针 `hover` 共享高亮、后到者胜。
- 键盘仲裁：↑/↓ 移动；**Enter 选中高亮行（无高亮则穿透提交）**；Tab 落定、drill 行 Tab 下钻；Esc/Shift+Tab 离开不落定；refinement 挂起时 Enter/Tab 是显式 no-op（绝不选中过期行）。
- 视图：`MenuView.tsx` 渲染到 `conversation.input.overlay` 锚点、bottom-anchored、MAX_HEIGHT 400、`role="listbox"` + `aria-activedescendant`、分组标题行、**焦点永不离开编辑器**（行用 mousedown 接）。
- 源：`/` 命令（Host 目录 + 客户端贡献，用量排序 + `TextSearchIndex` 排名；选中变**命令 chip**进 claimed 态）；`/` skill（选中插入纯文本 `/name `，Host 展开；chip 可点开侧栏预览）；`@` 文件/目录/会话（目录行 Tab 下钻或落定为原子 ReferenceChip；chip 点击侧栏打开）。
- PopupSelect：命令参数选择器（如 `/permission`），独立搜索焦点，`command.decorate({ui:{kind:'popupSelect'}})` 挂载，危险项有 RiskConfirmation。
- 工具栏「+」按钮可编程拉起命令菜单 + 隐藏 file input。

### 2.3 模型选择器（`packages/client/ui-model-selection/src/client/ModelSelect.tsx` 716 行）

- 座位在 composer 尾部工具行（slot `conversation.input.model`）：触发钮 = 图标 + `model name · effort label` + chevron，选择挂起时转点。
- **两级下钻菜单**（portal 到 body 的 `MenuSurface`）：根面板 Model / Effort 两行各自下钻；模型列表按 provider 分组（sticky 标题）、>4 个出搜索框（子序列模糊，前缀→对齐→目录序排名）、行内 ✓；目录加载失败有重试条；拒绝选择以 toast 锚在 composer 卡。
- 键盘：↑/↓、搜索时循环高亮、Enter/Tab 接受、Esc 先退出下钻层再关、Shift+Tab 等价 Esc；选择后焦点还原到触发钮。
- **模型座位是 composer 被锁（sending 等）时唯一保持可用的控制**。
- 状态：per-session `ModelDirectory`；`ModelSelection = {provider, model, reasoningEffort?}`；effort 元数据来自 Host；选择 Host 侧按会话持久化。

### 2.4 ContextMeter（`ui-conversation/src/client/skeleton/ContextMeter.tsx` + `context-occupancy.ts`）

- composer 卡下方 **14px SVG 环**（2px 描边，strokeDasharray 比例），`percent = min(100, round(used/window×100))`；两者未知时不渲染。
- **点击开详情面板**（portal、CSS anchor 定位、Esc/点外关）：标题「45% of context used」+ `~used / window` K/M 紧缩数字 + **分段条**（system/tools/messages 三色）+ 图例 `dl` 逐桶启发式 token 数。
- 无阈值变色（单一强调色）——与 pi 相反的取舍。
- 用量底数：`contextPressure` 投影（provider 锚定采样 + 表面增量启发式重估）；auto-compact Host 侧 `thresholdRatio` 默认 **0.8**。
- 另有每轮 usage pill（`TurnUsagePanel`，含 cache-hit%）与 composer dock 的 StatsPills。

### 2.5 Queue / Steer（`ui-conversation/src/client/queue/QueueDock.tsx`，slot `conversation.input.dock` = 输入框上方）

- 提交策略 `submission-policy.ts`：`resolveSubmitMode(preferred, running, gesture, steeringAvailable)`——空闲一律 queue；运行中 Enter/Send 按钮用用户 **busyEnter 偏好**（`queue|steer`，Host 设置持久化，默认 queue），Ctrl/Cmd+Enter 取反。
- 运行中发送按钮文案随之变化：**「排队发送」/「插话发送」/空闲「Send」**，sending 阶段「Sending」。
- **QueueDock**：durable 队列行（Host inbox 投影）+ 本地未确认提交的「Sending…」行（动作禁用）；单条直渲染、多条折叠计数头「N queued messages」**编辑时自动展开**。
- **行内操作**：Edit（行内 InlineEditor，存/取消；非文本内容禁用带 tooltip）、Remove（垃圾桶）、**Steer now（发送图标；非运行态禁用）**；走 `updateQueue(itemId, {kind:'edit'|'remove'|'steer'})` RPC；失败以 composer notice 浮出；行内可渲染图片缩略图与文件卡。
- Stop 方按钮：运行中出现在尾部控制区，tooltip 直接标出 `Esc, Esc` 键位；stop **保留队列**。

### 2.6 编辑已发送 / retry / fork

- **没有已发送消息的就地编辑重发**（编辑只存在于队列行）；消息级动作有复制、**branch**（fork 出新 session 并打开，尾消息才可用，Ctrl/Cmd+Alt+F），fork 来的继承历史有分割线。
- 失败后发送按钮变**「Continue」**（`conversationContinuation` 投影）——retry 是一次允许空的常规提交，不是逐消息 regenerate。

### 2.7 其它

- 附件栏（缩略图灯箱、上传进度/重试、拖放 overlay、上传中禁发送）；权限预设选择器（也做成 `/permission` popupSelect）；plan 模式 chip（仅生效时显示）；**审批卡/提问卡以更高优先级沿 `conversation.composer` 链整体接管 composer**（Enter=允许 / Esc=拒绝）；toast 锚 composer 卡；焦点管理（切会话自动聚焦、恢复、mousedown 不抢焦点）；Ctrl/Cmd+/ 可搜索快捷键面板（含输入组固定条目）。
- 两库共同缺失：**无 ↑/↓ 输入历史召回（dsh）**、**无已发送消息就地编辑（两者，用 fork 替代）**、dsh 上下文条无阈值色。

## 3. 本仓库现状与真实边界（E:\workspace\mycode\agent-design）

### 3.1 Composer 现有件（`packages/app/src/features/transcript/Composer.tsx` 159 行；样式在 `transcript.module.css`）

- Props：`{model?, thinkingLevel?, toolCount?, variant?, drive?}`；`ComposerDrive = {status, onSend, onFollowUp, onAbort, callingTool?, queuedCount?, compacting?}`，drive 缺席 = 禁用 textarea + attachHint。
- 底栏 pills 全是死 span：model / thinkingLevel / **toolCount（会话累计）** / **running / retrying / compacting / calling（仅最新一个流式工具）/ queued（仅计数）**；运行中出现「追问/followUp」按钮与「中止」按钮；textarea 单行起、`field-sizing: content` 自动长高、IME 有 `isComposing` 守护、Enter 发送 / Shift+Enter 换行。
- 发送语义在 `DriveClient.sendText`（`packages/app/src/state/use-drive.ts`）：running/retrying → steer，否则 prompt + `streamingBehavior:"steer"` 竞速兜底；本地 `pendingPrompt` echo。

### 3.2 协议与 core 的真实边界（关键事实）

- `packages/shared/src/protocol.ts`：`DriveCommandBody` **只有** prompt/steer/followUp/abort；ClientFrame = attach/create/release/drive。**没有 setModel、setThinkingLevel、队列操作、命令执行、任意 RPC。**
- `packages/core/types.ts` `PiSessionLike`：snapshot/subscribe/prompt/steer/followUp/abort/drainNewEntries/dispose——**无模型/thinking 设置器**；ADR-0012 明确推迟「模型与 thinkingLevel 切换、fork、扩展交互、工具执行审批 UI」。
- **pi 内核本身有这些能力**（`packages/coding-agent/src/core/agent-session.ts`）：`setModel(model, {persist})`、`cycleModel`、`setThinkingLevel`、`getAvailableThinkingLevels()`、`getContextUsage()`（tokens/contextWindow/percent）、模型目录 `modelRuntime`。core 接缝（`PiSessionLike` + `SessionHost` + WS 网关 + 协议四层同步扩）即可接入，不动内核。
- `DriveEventBody.queue{steering[], followUp[]}` 已把**队列内容**推到客户端（`DriveSession.queued`），只差操作命令；`status` 事件带 retrying 的 `attempt`；compaction 有 phase 事件且内核在 compacting 期拒绝新 prompt。

### 3.3 数据可用性（上下文环）

| 需要 | 现状 |
|---|---|
| 已用 tokens | ✅ 每条 assistant 的 `UsageInfo`（input/cacheRead/cacheWrite/output/totalTokens）在 entries 里；pi 口径 = 最后一条的 input+cacheRead+cacheWrite |
| context window | ❌ 任何层都没有；需随 attach/模型切换下发（或临时硬编码模型窗口表） |
| system/tools/messages 分桶 | ❌ `UsageInfo` 无此口径；dsh 的分桶是启发式，pi 干脆不做——明细条大概率做不了，hover 先做 tokens/percent/window/compact 状态 |
| model / thinkingLevel | ✅ `model_change` / `thinking_level_change` entries → `TranscriptModel.model/thinkingLevel`（派生，无 store 槽位） |

### 3.4 组件原语缺口

- **无 popover / dropdown / menu / tooltip / HoverCard / chip 原语**；只有 `--z-popover`、`--shadow-popover` 两个令牌。「chips」全是各特性 CSS module 里手搓的 span。Base Component 现仅 Button / Input / Icon / DisclosureRow。
- i18n（ADR-0011）：en/zh 同步新增，编译期强制；`formatTokens` 已有（1.2k/3.4M）。
- ADR-0009：Session Bar 的模型/token 统计已被移除，**Composer 是模型/thinking 展示的合规归宿**——本次改动方向与此一致。
- ADR-0014：TUI 模式运行组钉在视口底部、紧贴 Composer 上方——队列 dock 若放「输入框上方」，在 TUI 模式下与钉住的运行组的层叠关系要定。

## 4. 需求逐条映射

| # | 需求 | 参照 | 本仓缺口 | 涉及协议/core |
|---|---|---|---|---|
| 1 | 模型 + thinking 选择 | pi Ctrl+L 选择器 / dsh 两级下钻 | pills 是死 span；无目录、无设置命令 | **setModel/setThinkingLevel 命令 + 模型目录 + 每模型档位**；持久化层级（会话级 vs 默认级）待盘 |
| 2 | 上下文 SVG 环 + hover 详情 | dsh ContextMeter | 数据缺 contextWindow；无环组件；无 HoverCard/Popover | contextWindow 下发（attach 帧/事件）；tokens 可先从 entries 派生 |
| 3 | `/` 命令、skill 菜单 | dsh 触发菜单 + 命令 chip；pi 参数补全 | 无触发检测、无菜单、无目录、无执行路径 | **命令/skill 目录 surface + 执行语义**（pi 的斜杠是 TUI client dispatch，web 端要么映射到 drive 命令要么内核加 dispatch——盘问点） |
| 4 | 公共 popover 原语 | dsh `ui-primitives` MenuSurface/MenuGroup/Tooltip/HoverCard | 无 | 纯客户端：新建 Base Component（anchored menu surface + tooltip 至少） |
| 5 | 去掉 toolCount / 运行状态 / 追加按钮 | dsh：Stop 钮 + 状态化占位符 + QueueDock 接管 | 删即可；retry/compacting 需新去处 | retry 可用 status 事件 attempt；纯客户端 |
| 6 | 队列：上方等待、可编辑、追加行立即发送 | dsh QueueDock（Edit/Remove/Steer now/折叠头）；pi Alt+Up 整批还原 | 队列内容已在手，只有计数 pill | **队列操作命令**（remove/edit/steerNow 或 replaceQueue） |
| 7 | 其它遗漏点 | 见 §5 | — | 见 §6 |

## 5. 遗漏点清单（用户没提、但两库有或本仓必需）

**纯客户端可做（不碰协议）**
1. `event.repeat` 防连发（dsh）——现在按住 Enter 会连发。
2. Esc 层级化：关菜单 → 双击 Esc（500ms 窗口）中断；Stop 按钮 tooltip 标键位；中断保留队列（dsh）。pi 的变体：中断时把队列还原回编辑器。
3. 占位符随状态切换（空闲/可 steer/队列可整批 steer/不可用）。
4. 发送阶段状态机：sending 冻结编辑 + 失败草稿原样归还 + commit 切断 undo 历史（dsh machine/facade——本仓 pendingPrompt echo 已是雏形）。
5. 草稿按会话持久化（localStorage，恢复不抢焦点）。
6. 多条队列折叠计数头、编辑时自动展开；Steer now 非运行态禁用。
7. 模型座位在被锁时仍可用（dsh）。
8. a11y：listbox + aria-activedescendant combobox 模式，焦点不离开编辑器，行用 mousedown。
9. 上下文环阈值色（pi 70%/90%）vs 单色（dsh）——取舍待盘。
10. 输入历史 ↑/↓ 召回（pi 有 dsh 无； viewer 价值中等，可选）。
11. compaction 期间输入抑制的表达（现在的 compacting pill 去掉后放哪：占位符？禁用态？）。
12. retrying 的表达（status 事件带 attempt，可做倒计时式提示）。

**需要协议/core/server 扩展**
13. 队列行内操作（见 §4#6）。
14. 模型/thinking 切换与目录（§4#1）。
15. contextWindow 下发（§4#2）。
16. 斜杠命令/skill 目录 + 执行路径（§4#3）。
17. `@` 文件提及（pi fd 模糊 / dsh 下钻 chip）——需要文件枚举 API（server 新端点或内核提供）。
18. 图片/附件粘贴 intake（pi 走临时文件路径；dsh 有上限预检与上传进度）——`prompt` 命令需支持 images（pi API 本就支持 `prompt(text, {images})`）。
19. fork-from-message / branch（两库都用 fork 替代就地编辑；本仓已有 branched 概念）——ADR-0012 推迟项。

**明确不做也说得通的**：pi 的 bash `!` 模式、外部编辑器、kill ring/emacs 键位（web 原生）、dsh 的 plan 模式 chip 与审批卡（等内核接入推进）。

## 6. 架构改动清单（四层同步）

1. **protocol**：`DriveCommandBody` 增 `setModel{provider, modelId, persist?}`、`setThinkingLevel{level}`、`updateQueue{itemId, action: edit|remove|steer}`（或 replaceQueue）；新事件或 attach 帧携带 `modelCatalog`（含每模型 thinking 档位）与 `contextWindow`。
2. **core**：`PiSessionLike` 增 `setModel/setThinkingLevel/getAvailableThinkingLevels/getContextUsage`（内核已有，纯接缝）；`SessionHost` 转发并在 `model_changed/thinking_level_changed`（已有 entry 流）与 turn 结束后推 usage。
3. **server**：WS 网关放行新命令；（可选）REST 端点：模型目录、文件枚举（@ 提及用）。
4. **app**：新 Base Component——Popover/MenuSurface（anchored、portal、listbox a11y）+ Tooltip（或 HoverCard）+ Chip；Composer 重构（状态机、触发菜单、QueueDock、ContextMeter、模型座位）；store 增模型/上下文切片（ADR-0015 方式）；i18n en/zh 同批。

## 7. 待盘问的开放问题（喂给 /grill-with-docs）

1. busyEnter 偏好：运行中 Enter 默认 queue（dsh 默认）还是 steer（pi 现行为、本仓现状）？要不要用户偏好 + Ctrl+Enter 取反 + 空草稿整批 steer？
2. steer 与 followUp 双通道保留吗？QueueDock 单一 FIFO（dsh）还是分 Steering/Follow-up 两区（pi）？「追加按钮」去掉后 followUp 语义并入队列区的哪个动作？
3. 模型/thinking 持久化层级：仅会话级，还是也支持「存为默认」（pi Ctrl+S）？
4. 上下文环：阈值色 vs 单色；hover 还是点击开详情；明细桶（system/tools/messages）确认做不了后，hover 里放什么（tokens、window、percent、模型、compact 状态、每轮 usage？）。
5. 斜杠命令的执行语义：目录从哪来、`/xxx` 文本是走 prompt 透传给内核解释，还是客户端映射成 drive 命令，还是内核加 dispatchCommand？
6. 去掉运行状态 pills 后，retrying / compacting 各自的表达（占位符、禁用态、Stop 钮旁的瞬态文案？）；TUI 模式下队列 dock 与钉住运行组的层叠。
7. Popover 原语的最小集：只做 anchored menu surface，还是连 Tooltip/HoverCard 一起收编（hover 详情依赖后者）？
8. `/` 触发范围：仅行首（pi）还是词边界检测（dsh，含 URL 例外）？
9. 草稿持久化与输入历史这两件「会话恢复类」特性做不做（成本低收入也低）。
10. `@` 文件提及、图片附件是否进入本轮范围（都拖 server/core）。

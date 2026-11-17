# Pi Studio

基于 pi 内核本机数据的 agent 会话客户端（高保真阶段为只读查看器）。代码、文档与 UI 文案全程沿用以下术语。

## Language

**Session**:
pi 内核的一次会话，落盘为追加型 JSONL 文件，是本客户端读取与渲染的基本单位。
_Avoid_: 对话、聊天记录、chat

**Project**:
一个本地项目目录（即 pi session 所属的 cwd），Session 在 Sidebar 里的归属分组。
_Avoid_: 工作区、workspace、仓库

**Sidebar**:
左栏组件，按 Project 分组的 Session 列表。
_Avoid_: 工作区、workspace、左栏面板

**Brand Float**:
固定于视口左上角的品牌位：单枚按钮，静止显示 π，hover 淡入动作图标（主壳 = Sidebar 收起/展开，Settings = 返回），与所在表面融为一体；主壳与 Settings 常驻（ADR-0009）。
_Avoid_: 顶栏、TopBar、标题栏（与 Session Bar 混淆）、悬浮胶囊

**Transcript**:
右侧对话区组件，渲染选中 Session 的全部消息。
_Avoid_: 聊天区、对话块、消息流

**Session Bar**:
内容区标题栏：Session 标题、branched 徽标与动作区（全屏、主题切换、渲染模式快切）（ADR-0009，渲染模式见 TUI Mode）；model/tokens/cost 统计展示已移除。
_Avoid_: 顶栏、TopBar、工具栏

**Settings**:
独立整页双栏设置壳：自有侧栏导航（Preview、Appearance、About）与内容区，进入时替换主壳（ADR-0009）。
_Avoid_: 设置面板、设置弹层

**Live Tail**:
对最近活跃 Session 的轮询追踪，只读地呈现其进行中的流式更新；被驱动（Drive）的 Session 由驱动事件流供给增量，不经 Live Tail。
_Avoid_: 实时模式、streaming 模式

**Drive**:
经内核驱动一个 Session：发出 prompt、执行工具并产生真实写入（新建或追加该 Session 的 JSONL）；区别于只读的 Live Tail。
_Avoid_: 聊天、发送消息（作为能力名）、跑 agent

**Disposition**:
内核对一个排队输入的应答：`queued`（已入队）或 `handled`（已被扩展处理）；仅 steer / followUp 有，不落盘。
_Avoid_: 返回值、ack

**Attach**:
把一个已有 Session 载入内核继续 Drive；接管后该 Session 走驱动事件流，Live Tail 对其失效。
_Avoid_: 打开、载入、恢复会话

**Entry**:
session JSONL 中的一行记录，是条目树的节点（含 `id` 与 `parentId`）。
_Avoid_: 行、记录、event（与运行时事件流区分）

**Active Branch**:
条目树中从活动叶子沿 `parentId` 回溯到根的路径；Transcript 仅渲染活动分支。
_Avoid_: 主线、当前路径

**Annotation**:
注解级条目：不进 Turn / Process Group 正文，渲染为细分隔线与灰色小字的非消息条目（compaction / branch_summary / 首次 session_info）；首条 user 之前的落 `orphanAnnotations`（ADR-0004 三级呈现策略）。custom_message 与 system message 虽同走注解通道（模型层不进正文），视图已升级为独立的可展开行（见 Context Injection、System Prompt）。
_Avoid_: 注释、系统消息、分隔条

**Context Injection**:
扩展经内核 `sendMessage` / boundary draft 写入 session 的 custom_message 条目：`content` 参与 LLM 上下文（发给模型时转 user 消息），`details` 是扩展私有元数据、不上送模型；`display:false` 不渲染（ADR-0004）。Transcript 渲染为可展开的注入行——「上下文注入」标题 + customType 摘要，展开见正文与元数据（ADR-0007 代码面）。与不进上下文的 custom 状态条目（`type:"custom"`）是两类东西。
_Avoid_: 注入事件、扩展消息、自定义消息

**System Prompt**:
内核每轮 run 前对系统提示词做 sections 级 diff、有变化才落盘一条 `role:"system"` 的消息条目：`content` 为空串，全文在 `message.sections`（preamble / tools / rules / docs / project_context / skills / cwd；project_context 段即 AGENTS.md 等项目说明的渲染）。Transcript 渲染为可展开的系统提示词行——「系统提示词」标题 + 段数摘要，展开逐段呈现；首条 user 之前的落 `orphanAnnotations`（ADR-0004 修订三）。与 Context Injection 同族：都是发给模型、不在对话正文的内容。
_Avoid_: 系统消息、系统条目

**Compaction**:
pi 对上下文的压缩事件，原始条目永不删除；Transcript 中渲染为注解。
_Avoid_: 把压缩表述为删除

**Turn**:
一轮对话：从一条 user 消息开始、到下一条 user 消息之前的全部内容；Transcript 的顶层单元。
_Avoid_: 轮次、回合、session（与 Session 混淆）

**Process Group**:
Turn 内以 assistant text 回答为分隔符的一段连续非文本内容（thinking、toolCall+toolResult、bashExecution，可跨多条 assistant 消息）。一个 Turn 可以有多个 Process Group，它们与回答按源顺序交替（ADR-0013 前称 Tool Group，折叠收敛为一级后改名）。
_Avoid_: 工具组、工具批、步骤组、batch

**TranscriptModel**:
Transcript 渲染所需的完整派生数据，Session 视图的唯一派生出口：`buildTranscriptModel(entries)` 从 Entry 列表一次算出 Turn 列表（内含按源顺序交替的 Process Group 与回答）、孤儿注解、被弃分支计数、最后模型声明、思考等级与工具调用数；工具条目的四态、`terminal`、`subCalls` 也在本层归一，视图层零伪造。Entry 树本身不对外暴露。
_Avoid_: 派生数据、视图状态、session 状态

**Recap**:
每个 Process Group 顶部默认折叠的结算摘要条，从 `TranscriptModel` 的派生量算出（工具数、思考数、失败数、本轮耗时、本轮 tokens；被弃分支数只标在首个 Turn，Draft 标记只标在末个组）。只报可解释的量，不发明状态色或「思考中」这类自称（ADR-0013）；内核没给 usage 就不报 tokens。
_Avoid_: 轮聚合条、步骤条、summary（与 compaction 的 summary 混淆）

**Process Strip**:
Recap 展开后逐条铺开的工具/思考行，DSH 式极简 disclosure 行——图标、工具名、摘要、状态，行内无卡片无耗时；一次点击在 Recap 与 Strip 之间切换（ADR-0013）。
_Avoid_: 工具组、分组条、工具卡列表

**TUI Mode**:
Transcript 的第二渲染形态（ADR-0014）：终端模拟风格，仅覆盖 Process Group 区（运行摘要行、槽位行、终端块、diff），user 气泡与 assistant 正文仍走现渲染。动态运行渲染（Running 摘要行、槽位行内秒数、流出输出、完成自动收起）为本形态专属；两模式从同一 TranscriptModel 派生，现渲染形态在配置中称 Standard。切换同主题机制：Appearance 存默认、Session Bar 快切。
_Avoid_: 终端模式（与主题混淆）、compact 模式、TUI 视图（作为配置值时）

**Tool State**:
工具行的四态：`running`（无配对结果，内核仍在跑或流式草稿）、`ok`、`error`（`isError`）、`stopped`（bashExecution 被取消）。**行内**只以文字色表达，不用彩色徽标（ADR-0013）；唯**终端块的 gutter 状态点**保留分档颜色，是该条明列的例外。四态各自成类，由视图层一张 `STATE_VIEW` 表统一驱动标签、字形与类名。

嵌套调用（内核 `details.calls[]` 的 `CodemodeNestedCallStatus`：`running` / `ok` / `error` / `cancelled`）在模型层归一到同一套词汇——`cancelled` 即 `stopped`，全应用只保留一套状态词；未知或缺失状态留空，不伪造成 `ok`。
_Avoid_: 状态徽标、成功失败态、Sub Call Status

**Draft**:
流式期间由 delta 累积出的瞬态条目（assistant 的 text / thinking），不落盘；权威条目落盘后整段让位。Draft 与落盘条目在 Recap 里可区分（ADR-0013）：模型层以「末条 assistant 的 `stopReason` 仍为 `pending`」判定，标成 `Turn.draft`，视图只读这个布尔，不读内核字段。
_Avoid_: 草稿、临时消息、streaming entry

**Pending Echo**:
已发出的 prompt 在内核权威 user 条目回传前的本地回显——客户端合成的瞬态 user 条目，不落盘。pi 的监听器先于持久化被调用，user 条目最早在 assistant 的 `message_start` 才回传（ADR-0012 补记四），这段窗口由它顶住内容区；权威条目一落盘、命令被拒（error / commandFailed）或回到 idle 即让位。连接未就绪时不挂（发送帧会被静默丢弃，凭证不能先亮）。与 Draft 同族：都是客户端瞬态叠加、都挂活动分支叶子（`activeLeafId`），都喂同一个 `buildTranscriptModel` 出口。
_Avoid_: 本地气泡、乐观回显、optimistic echo

**Preview**:
设计验收用的组件清单页（图标全网格、控件、色板、字阶与消息样张），挂在 Settings 侧栏导航下（/settings/preview）；样式直接引用各组件 module.css 源头。
_Avoid_: 组件库、Gallery（作为页面名时）

**Base Component**:
`components/` 目录下的可复用件，判据是无业务语义（Icon、Button、Input、DisclosureRow 及其样式原语）；与 features/ 下的业务复合件相对。专用形态用组合表达（icon 槽位、leading 槽位），不为单一消费点造特化组件。
_Avoid_: UI 库、通用组件、IconButton / SearchField（已被 Button / Input 吸收）、ui/ 目录（旧称）

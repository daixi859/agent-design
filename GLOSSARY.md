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
内容区标题栏：Session 标题、branched 徽标与动作区（全屏、主题切换）（ADR-0009）；model/tokens/cost 统计展示已移除。
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

**Compaction**:
pi 对上下文的压缩事件，原始条目永不删除；Transcript 中渲染为注解。
_Avoid_: 把压缩表述为删除

**Turn**:
一轮对话：从一条 user 消息开始、到下一条 user 消息之前的全部内容；Transcript 的顶层折叠单元。
_Avoid_: 轮次、回合、session（与 Session 混淆）

**Tool Group**:
Turn 内以 assistant text 回答为分隔符的一段连续非文本内容（thinking、toolCall+toolResult、bashExecution，可跨多条 assistant 消息）；Turn 的中层折叠单元。
_Avoid_: 工具批、步骤组、batch

**TranscriptModel**:
Transcript 渲染所需的完整派生数据，Session 视图的唯一派生出口：`buildTranscriptModel(entries)` 从 Entry 列表一次算出 Turn 列表、孤儿注解、被弃分支计数、最后模型声明、思考等级与工具调用数；Entry 树本身不对外暴露。
_Avoid_: 派生数据、视图状态、session 状态

**Preview**:
设计验收用的组件清单页（图标全网格、控件、色板、字阶与消息样张），挂在 Settings 侧栏导航下（/settings/preview）；样式直接引用各组件 module.css 源头。
_Avoid_: 组件库、Gallery（作为页面名时）

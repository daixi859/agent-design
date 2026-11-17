# 接入 pi 内核：workspace 分层，驱动协议为唯一缝

Pi Studio 从只读查看器进入驱动阶段（修订 ADR-0002 的只读边界）。接入方式采用 pi 的进程内 SDK（`@earendil-works/pi-coding-agent`）而非 CLI RPC 子进程。仓库立即改为 pnpm workspace，按传输无关的分层拆包：

- `packages/shared`：同构层。pi 数据类型（`pi-types.ts`）、纯文本逻辑（`message-text.ts`）与驱动协议类型（`protocol.ts`，新增类别：协议类型入 protocol.ts，pi 数据类型仍入 pi-types.ts）。
- `packages/core`：内核接入层。`SessionHost` 包装 `createAgentSession` / `AgentSessionRuntime`（prompt / steer / followUp / abort / 新建 / 接管），`SessionRegistry` 按 sessionId 多路复用，事件规范化为协议 Event。core 不知道任何传输层的存在，可独立单测。
- `packages/server`：进程层。独立 Node 进程；REST（`/api`，只读浏览，`pi-data.ts` 原样迁入）+ WS（`/ws`，驱动协议，按 sessionId 多路复用）；生产模式下托管 app 构建产物。
- `packages/app`：现有 React 应用。`pi-client` 拆为 REST 读与 Gateway 客户端两半。
- `packages/desktop`：后续 Electron。main 进程直接 import core，以 IPC 实现同一协议，渲染层复用 app。

三条关键缝：**协议是唯一缝**（web 走 WS、Electron 走 IPC，实现同一套 Command/Event，渲染层零改动）；**core 不依赖传输**；**读路径不变**（浏览历史 session 仍走文件扫描 REST；被驱动 session 由事件流供给，最终汇入同一个 `buildTranscriptModel` 出口，Transcript 不区分 tail 来的还是驱动来的）。

范围（阶段一）：prompt / steer / followUp / abort / 新建 Session / 接管已有 Session；协议自第一天起按 sessionId 多路复用，UI 先单活跃。延后：模型与 thinkingLevel 切换、fork、扩展交互（MCP / codemode）、工具执行审批 UI。

## 明文子决定（防止隐含假设）

- **驱动的落点**：在真实项目 cwd 创建/接管真实 session 文件，复用 `~/.pi` 同一套设置与凭据，与 pi CLI 共享同一数据面；不做沙箱目录、不建第二套配置。
- **断线恢复以落盘文件为准**：session JSONL 是唯一权威历史；WS 重连后客户端 re-attach，按字节偏移重放（复用 Live Tail 的增量读取），事件流只供增量。
- **属主标记仅存内存**：单一 server 实例持有被驱动 session 的属主记录，进程消亡即释放；不引入文件锁，对 pi CLI 并发驱动同一 session 仅 best-effort 互斥。
- **依赖选型**：新增 `@earendil-works/pi-coding-agent` 与 `ws`，不引入服务端框架（沿用裸 `node:http` 风格），也不引入 tsx 等运行器。
- **Node 原生直跑纪律**：server 与后续 core 代码只用可擦除语法（无参数属性 / enum / namespace），相对导入一律带 `.ts` 扩展名，使 server 可裸 `node` 启动（workspace 迁移时已按此落地并验证）。

## 考虑过的选项

- **CLI RPC 子进程（RpcClient）**：进程隔离好，但多一跳序列化与子进程生命周期管理；SDK 已提供进程内的类型安全与事件订阅，弃。
- **继续挂在 vite middleware**：WS 长连接与 pi session 生命周期不应绑定 dev server；独立进程让 dev / prod / Electron 三种形态共用同一入口，弃。
- **沙箱目录驱动**：违背「接入真实 pi 数据面」的初衷，制造第二真相源，弃。
- **协议后做多路复用**：UI 先单活跃时看似多余，但事后补 sessionId 复用是破坏性协议改动，day-1 成本近零，故提前。

## 后果

- 修订 ADR-0002：输入区成为功能件；只读浏览路径（REST + Live Tail）保持不变。
- 被驱动的 Session 是用户真实数据，Drive / Attach 语义见 GLOSSARY；与 pi CLI 并发驱动同一 session 无强制互斥。
- dev 拓扑变化：`node packages/server` + `vite`（proxy `/api` 与 `/ws`）；typecheck / test / githooks 判据需随 workspace 迁移同步调整。
- 从 Web UI 驱动会在真实 cwd 执行工具（含 bash），信任边界与 pi CLI 相同（本机单用户，无鉴权）。

## 实施后补记（阶段四落地时被真内核推翻的假设）

三条原设计假设被实证推翻，记录以免后人重走：

- **条目推送不能只靠 `entry_appended`**。pi 只在部分路径发该事件（custom entry、context edit、边界草稿）；普通消息与工具结果落盘时**不发**。协议仍以 Entry 为中心，但由 `SessionHost` 在 `turn_end` 与 `agent_settled` 两个边界主动向内核拉取条目树的新增尾部（`PiSessionLike.drainNewEntries()`，以条目数为水位）。事件流因此仍是权威条目的搬运工，而非唯一来源。
- **属主标记必须随连接消亡释放**。原设计写「进程消亡即释放」；实测浏览器刷新（WS 断开）后旧标记残留，同一 session 再也无法接管。修正：连接关闭时逐一 `release` 该连接持有的全部 session —— 属主生命周期是**连接**，不是进程。
- **渲染层派生 memo 不能漏掉数据就绪信号**。`attached` 帧可能先于 REST 全量返回；若驱动视图 memo 只依赖驱动状态，会永久冻结在非驱动分支（实测：徽标已变、输入框仍禁用）。修正：memo 依赖里带上 fetch 完成信号。

## 补记二（复核轮）：create 快照与快照范围

**问题**：`SessionManager.create` 在首条 user/assistant 消息落盘前不写文件（pi 的 `_hasConversation` 门），而驱动 UI 必须在用户发出第一条消息**之前**就能渲染并激活输入区。原设计「断线恢复以落盘文件为准」在此不成立——文件还不存在。

**决定**：`attached` 帧增带 `header` + `entries` 快照（`PiSessionLike.snapshot()`，形状定义为 shared 的 `SessionSnapshot`）。**快照只随 create 路径下发**：attach 的会话已落盘，基线走 REST，事件流只供增量——避免把「按字节偏移重放」静默替换成「每次 attach 全量重放」（那会把 Live Tail 的故障搬进 WS）。

**后果**：

- create 出的会话在首条消息前没有文件，REST 404 属预期；客户端以回包快照为基线，首条消息落盘后 REST 自然接管。
- attach 路径不带宽量快照，重连的 `attach` 仍是一句轻量帧。

## 补记三（复核轮）：错误码与文案归属

服务端自造的协议错误（会话已被驱动 / 冲突 / 未驱动 / 坏帧）只发机器码 `DriveErrorCode`；文案在客户端 i18n（ADR-0011 英文为源语言）。服务端 `message` 保留为调试兜底，不作为用户可见文案。

## 补记四（缺陷修复轮）：「条目为中心」不等于「只推条目」

**问题**：从 UI 回车发消息后，对话区有一段时间完全不动（实测 6.8 秒），随后整轮内容一次性爆出。三轮增量实证：

- 一轮里 **152 个 `delta` 帧**搬运了 376 字正文，而 transcript 的文本长度全程不变。
- 客户端 `applyEvent` 对 `delta` 直接 `return prev`（当时的注释：瞬态增量不落状态）。
- 内核只在 `turn_end` / `agent_settled` 拉取条目，而 pi 的消息**整条落盘**、没有部分条目。

也就是说：条目确实是权威的，但在「模型已生成、条目尚未落盘」这段区间里，**事件流里唯一的正文载体就是 delta**；把它丢掉，渲染层就无料可画。这是把「条目为中心」（分层原则）误读成「只推条目」（推送策略）。

**决定**：`DriveSession` 增加 `streaming` 瞬态草稿位（shared 的 `StreamingDraft`）。delta 累积在客户端，渲染时合成一条**只存在内存里**的 assistant 条目挂在活动分支尾部，喂给同一个 `buildTranscriptModel` 出口——「读路径与驱动路径汇入同一出口」这条 ADR-0012 原决定因此不被破坏，`Transcript` 也不知道「流式」这个概念。

**边界**（保证不违反「entry 是权威、delta 瞬态可丢」）：

- 任何 `entry` 到达即清空草稿（消息条目必然出自内核，**不按正文比对**，否则权威条目与草稿不同段时会双份渲染）。
- 草稿的合成 id 为固定前缀，不会与内核条目 id 相撞；重放同一段 delta 只会得到同一份草稿，不产生新条目。
- 草稿丢了只是少一帧画面，权威条目到达后内容完整——「帧可丢」的性质未被削弱。

**另一处同源缺陷**：`SessionHost` 只在 `turn_end` / `agent_settled` 拉条目，连**用户消息**都要等整轮结束才回显（实测 6.8 秒后才出现）。pi 的监听器**先于持久化**被调用（`message_end` 列表先看到、条目后落盘），因此「某消息已落盘」最早在下一个 `message_start` 可观测。故刷新点改为 `message_start` / `message_end` / `turn_end` / `agent_settled`；水位改用 `getEntryCount()`（Map.size，无复制），避免 `getEntries()` 每次 `filter` 复制整个会话。

## 补记五（验收探针）：被「延后」的 codemode 实测长什么样

本清单 L13 把「扩展交互（MCP / codemode）」列为延后。为排查一次「真实数据不渲染 codemode」的报告，实测出**两个彼此独立**的缺口，记此以免后期误判为回归：

- **被驱动的会话里没有任何内置扩展**。`packages/core/src/pi-session-source.ts` 调 `createAgentSession({ sessionManager })` 不传 `resourceLoader`，落回 `DefaultResourceLoader` 而 `extensionFactories` 默认为空；`builtInExtensions`（codemode / tool-search / mcp / llama.cpp）只由 pi CLI 自己注入。实测 create 与 attach 均为 10 个工具、无 codemode —— **全量 780 个 session 里那 63 个真有 codemode 调用的会话，都是 pi CLI 跑的，与 pi-studio 无关**。
- **实时嵌套状态到不了客户端**。嵌套调用状态只挂在顶层 codemode 的 `tool_execution_update.partialResult.details.calls` 上（子调用自己带 `parentToolCallId` 的事件不带 aggregate details），而 `normalize.ts` 丢弃全部 `tool_execution_*`。落盘后的 `details.calls` 只有终态（残留 `running` 在脚本收尾时已被改写成 `cancelled`），所以**不存在「卡在 running」，只是看不到过程**。

两条原为主动的范围切分。第一条（内置扩展注入）已于 2026-11-17 实施：`packages/core/src/pi-session-source.ts` 构造 `DefaultResourceLoader` 注入 codemode / tool-search / mcp 三个工厂（与 CLI 对齐），`createAgentSession({ sessionManager, resourceLoader })` 后 `bindExtensions({})` 触发 session_start（MCP 后台连接）；冒烟验证激活工具含 codemode / tool_search。第二条（嵌套调用实时通道）仍未实施。修复路线与实证见 [pi-kernel-notes.md §5.4](research/pi-kernel-notes.md)。

## 补记六（上游对齐轮）：prompt 的 streamingBehavior 竞态兜底

**问题**：客户端的 `DriveStatus` 由 `agent_start` / `agent_settled` 事件驱动，与内核的真实运行状态之间存在广播窗口。窗口内用户再发一条消息时，客户端以为是 idle 走 `prompt`，而内核正在 streaming——pi 对无 `streamingBehavior` 的 prompt 直接 throw（`agent-session.ts` 的 `_preparePrompt`），用户只见一条 error，消息没送达。

**决定**：协议 `prompt` 命令增带可选 `streamingBehavior`（`"steer" | "followUp"`，与 pi `PromptOptions` 及官方 RPC 同名同形），`SessionHost` 原样透传内核；客户端 `sendText` 发 prompt 时**固定带 `"steer"`**。内核 idle 时该字段无作用，正常运行语义不变；命中窗口时消息转为插话排队而非报错。运行中的显式 steer / followUp 命令保持不变，不受此兜底影响。

**后果**：

- prompt 与 steer 的区别只剩送达时机语义（本轮 vs 插话），不再承担「拒绝运行中发送」的守门职责——守门移交给内核的排队机制。
- 协议字段为可选，旧客户端不带该字段时行为与从前一致（命中窗口仍会报错），无破坏性。

## 补记七（验收修复轮）：瞬态条目必须挂活动分支叶子 + 首条消息的待回显

两条验收反馈，根源都在驱动视图的合成层（`driven-view`）：

- **「运行中思考/工具跑到文本下方」**：草稿合成条目的 `parentId` 写死 `null`。活动分支的叶子扫描按「未被引用为父的末条」取叶子，`parentId: null` 的草稿俨然一棵新树——**流式期间整条真实分支被误判为被弃**（实测：`abandonedCount: 2`，turns 只剩草稿一条，历史与用户气泡全部塌缩消失）。草稿必须挂到活动分支叶子（现由 `transcript-model` 导出 `activeLeafId`，与 `buildActiveBranch` 同一规则）；待回显条目同理，且草稿要接在待回显之后（链式挂叶，否则待回显自己变成新叶子把草稿挤成被弃分支）。
- **「回车后首 token 前内容区空白」**：补记四已实证 user 条目最早在 assistant 的 `message_start` 才回传——模型开口之前客户端没有任何「已发出」的凭证。决定：`DriveSession` 增加 `pendingPrompt`（GLOSSARY「Pending Echo」），客户端发 prompt 时即时合成一条瞬态 user 条目挂叶子，四个让位点——权威 user 条目落盘、`error`、`commandFailed`、回 idle；连接未就绪时不挂（帧会被静默丢弃，凭证不能先亮）。

同轮顺手修正两处草稿保真：内容块改按**流序**排列（思考先行、正文随后——原 text 在前，运行中思考出现在正文下方，权威条目落盘后又翻回去）；`toolcall_start` 的「调用中」指示合成 `toolCall` 内容块进草稿（原只亮 Composer 徽标，transcript 里没有运行中的工具行）。草稿时间戳从纪元占位改为真实当前时刻（草稿挂叶子后参与本轮结算，占位时间戳会把耗时撑成天文数字）。

**后果**：

- `streamingEntries(draft, calling, parentId)` / `pendingPromptEntries(text, parentId)` 签名即契约：瞬态条目的挂靠点由调用方（合成层）给定，合成器不再自作主张。
- 视图层零改动：两种瞬态条目仍喂同一个 `buildTranscriptModel` 出口，Transcript 不知道「流式」「待回显」存在。
- 草稿丢了仍只是少一帧画面；待回显的兜底是 idle 清口——最坏情形气泡随轮次结束消失，权威历史永远完整。

## 补记八（运行态渲染轮）：toolCall 帧扩字段与 tool_execution_* 放行

**问题**：TUI 运行态渲染（ADR-0014）需要执行中的参数与已流出的输出，而协议的 `toolCall` 帧只有 `{phase, id, name}`，normalize 把 `tool_execution_start`（带 args）与 `tool_execution_update`（带 partialResult）一律丢弃——「正在跑的命令是什么、输出到哪了」在两条路径上都到不了客户端（Live Tail 只拿落盘条目，JSONL 无运行中状态）。

**决定**：`toolCall` 帧扩为 `{ phase: "start" | "update" | "end"; id; name; args?; outputTail?; totalLen? }`——start 映射 `tool_execution_start.args`；update 映射 `tool_execution_update.partialResult` 的文本内容**尾部**（截断 4000 字符，`totalLen` 供「输出增长中」提示）；end 不扩（耗时从落盘 toolResult 的 `durationMs` 取，帧不带）。normalize 的透传名单相应放行这两个事件，其余照旧吞掉。

**边界**：update 帧沿袭「瞬态帧可丢」语义——丢了只是运行行少一帧输出尾巴，权威输出仍以落盘条目为准；截断是推送策略而非数据缺损，展开体的完整输出始终来自条目。客户端 `streamingToolCalls` 瞬态位随之扩为集合（并行工具调用各占一行），配对的 end / 权威条目到达即灭的既有规则不变；运行态在模型层经 `buildTranscriptModel(entries, liveTools?)` 的可选入参汇入同一出口，视图层不读内核字段。

**后果**：

- Live Tail 路径无 update 流（轮询拿不到未落盘内容），运行行输出区显示占位——两路径能力差异是本补记明示的，不是缺陷。
- `streamingToolCall` 单数位退役，消费方（Composer 徽标）取最近一次 start 的工具名。

## 补记九（思考定稿信号）：thinking_end 放行与 thinkingComplete 标志

**问题**：TUI 运行态的思考活跃判定（ADR-0014）只能靠「组是 turn 尾部 + 组内末条是思考」间接推断——真实驾驶里出现过「正文已开流渲染、思考行仍在转」的状态矛盾：思考块闭合的瞬间客户端无从知晓，只能等正文 flush 组这个间接后果。

**依据**：内核 `AssistantMessageEvent`（pi-ai types）有显式的块生命周期 `thinking_start → thinking_delta × N → thinking_end`，`thinking_end` 携带定稿 content，是**唯一精确的思考定稿信号**；redacted thinking 无 delta 直接 start→end。流式期间 `stopReason` 恒为 `"pending"`，不能当判据；`message_end`/`done` 粒度是整条消息，太粗。

**决定**：协议新增瞬态帧 `{ type: "thinkingEnd" }`（normalize 放行 `message_update` 里的 `thinking_end`，其余 `text_start/text_end/toolcall_delta` 等照旧吞掉）；客户端 `StreamingDraft` 加粘滞标志 `thinkingComplete`——`thinkingEnd` 帧置位，**首个 text delta 也置位**（帧可丢，语义同义的双保险），权威条目落盘草稿清空时一并重置。标志经 `buildTranscriptModel(entries, liveTools?, draft?)` 第三参（`{ entryId, thinkingComplete }`，只作用于调用方指认的合成草稿条目）汇入同一出口，driven-view 负责组装；视图层思考活跃判定（ADR-0014）加「未定稿」前提。

**后果**：Live Tail 路径无 delta 流（拿不到 thinking_end），思考行在浏览路径仍靠正文 flush 的间接判定收起——两路径能力差异沿袭补记八的口径，是明示的而非缺陷；测试侧 delta 分量的互不覆盖断言随新语义更新（text 到达即带 `thinkingComplete`），并补 thinkingEnd 帧与 normalize 放行断言。



## 补记十（参数流式可见）：toolcall_delta / toolcall_end 放行与 start 帧三源覆盖

**问题**：工具调用的参数在流式声明期恒为空对象（`toolcall_start` 时 arguments 尚未流出），运行行摘要只能显示 `{}`，要等 `tool_execution_start` 才第一次见到参数——pi-ai 的声明流其实是三段式 `toolcall_start → toolcall_delta × N → toolcall_end`，`toolcall_delta` 的 partial 块携带渐进 JSON 解析的**累积快照**（StreamingJsonParser），`toolcall_end` 携带定稿完整参数，两者都被 normalize 吞掉了（补记九明确「`toolcall_delta` 照旧吞掉」，本补记修订该口径）。

**决定**：协议帧不扩，仍复用 `toolCall` start 帧；normalize 的 `message_update` 分支放行 `toolcall_delta`（取 partial 对应 toolCall 块，重发带渐进快照 args 的 start 帧）与 `toolcall_end`（重发带完整 args 的 start 帧）。start 帧的 args 由此成为**三源依次覆盖**：声明期预填（toolcall_start）→ 参数流渐进快照（toolcall_delta，帧随流密发）→ 执行开始完整参数（tool_execution_start），同 id 后到者为准；快照无已完成键（空对象）时沿 toolCallStart 既有过滤不带 args。客户端 start 分支相应改为同 id **原位覆盖**（不再挪尾——连发多帧下挪尾会把活跃调用挤到队尾，运行行顺序抖动），名称与参数 JSON 同形时返回原引用，密发帧不触发重渲染。

**边界**：沿袭「瞬态帧可丢」——delta 帧丢了只是参数可见性晚几帧，权威参数仍以落盘条目为准；执行开始的完整参数是兜底来源，参数流整个丢失也不影响正确性。空参数调用（无参工具）三源均为空对象，运行行继续显示不带参数的裸工具名。

**后果**：Live Tail 路径无声明流（轮询拿不到未落盘参数），参数可见性差异沿补记八口径是明示的；客户端参数摘要随流逐步成形（`{}` → 部分键 → 完整 JSON），与真实终端体验对齐。

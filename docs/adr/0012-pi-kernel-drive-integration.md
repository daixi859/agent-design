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

## 补记十一（交互简化轮）：Send-to-Attach——attach 的同意动作并入首条发送

**问题**：显式驱动按钮把「同意」放在「意图」之前：进入老会话必先点一下才能输入，高频路径摩擦大；且按钮态（play）与他属冲突的实际判定（点击才报错）脱节。浏览只读的边界本身没有争议，争议的只是边界的表达方式。

**决定**：未驱动的落盘会话输入区常开，**首条发送即接管**（GLOSSARY Send-to-Attach）：客户端乐观注册最小 DriveSession（`pendingPrompt` 挂待回显；`attached` 分支以 `base = prev` 展开合并，乐观状态天然存活，纯归约零改动），并发 `attach` 帧；attach 在途的**后续发送入列**（file → 待补发消息序列，本地 `pendingQueue` 顶住显示），`attached` 回包到达即按 file 兑付、按序补发 prompt（第二条起内核经 `streamingBehavior: "followUp"` 兜底排队，与 sendText 同口径）。attach 被拒（`sessionAlreadyDriven`，属主心跳宽免窗）沿重连重放的**静默退避重试**（重试窗耗尽才落错误位并兑付失败）——此退避已由补记十六的单客户端租约取代，`sessionAlreadyDriven` 退役；其它拒绝按 file **精确**兑付失败——gateway 的 attach 错误帧携 `file` 回显（协议 error 帧扩可选 `file`），无 file 关联的连接级错误不撤待发送。他属驱动的前馈由 REST 下发：`/sessions` 列表加 `driven` 标志（组装层把 `registry.isFileDriven` 注入 pi-data），为真且本端驱动表无此会话时输入区禁用、占位符与发送钮 tooltip 提示「正在其它窗口驱动」。可接管的 file 依据以 REST 详情（`fetchSession` 一次取数）为主、5s 轮询摘要为辅——常开语义不依赖轮询命中。SessionBar 收敛为纯解除侧（pill + 解除钮），attach 钮退役；断线时待发送**不**兑付失败（乐观回显顶住，重连重放后续发）。

**边界**：属主排他与互斥语义不变——内存属主标记、文件级/sessionId 级标记、僵尸接管全部照旧，本补记只挪动**同意时机**（按钮点击 → 首条发送）。`driven` 标志是轮询快照（5s），发送瞬间的竞态（他属刚接管）由 attach 拒绝路径兜底，两道防线缺一不可。Trigger Menu 依赖 catalog（随 attached 帧下发），仍属驱动态功能，懒接管态不出现；create 路径仍 eager attach（快照只随 attached 帧走）；无 file 的会话不可驱动，输入区维持只读提示。

**后果**：

- `DriveClient.pendingSends`（file → 待补发消息序列）与 `pendingCreates` 同构而兑付语义各随其需：attach 错误帧按 `file` 精确兑付失败；断线时 create 立即失败（有 Promise 悬挂问题）而 lazy 保留续发（无 Promise，乐观回显顶住）。
- composer 可输入口径从「已被驱动」变为「已驱动或可接管」（`canInput`），草稿持久化随之覆盖浏览态；LazyComposer 插槽由 SessionView 组装，file 依据详情直取、他属判定取轮询摘要 × 本端驱动表。
- 测试：乐观注册被 attached 帧保留 / commandFailed 清待回显但保留会话壳（撤会话不属归约）落在 drive-client 纯归约；driven 标志落在 pi-data 注入谓词。

## 补记十二（交互简化轮续）：浏览态可选——Model Seat 目录缓存与选择挂起兑付

**问题**：补记十一把 attach 的同意挪到首条发送后，浏览态（未驱动）底栏的 Model Seat 失去 catalog（随 attached 帧一次性下发），退化为纯只读——与输入区常开可写的新语义不一致：「换模型再发」手势在浏览态断档；曾接管的会话 detach 或刷新后重进，连切模型都不可为，底栏信息随接管时机消失。

**决定**：attached 帧的 catalog 由客户端按 sessionId 缓存（内存 store 切片 + localStorage 续命跨刷新，release 不清，attach 覆盖刷新），浏览态 Model Seat 以缓存目录渲染**可选**菜单；目录完全缺席（首次浏览 / 他属驱动 / 不可驱动）时维持只读展示，值取 entries 派生。浏览态选择写入挂起选择（merge 语义，乐观显示），首条发送随懒发送入列，attached 兑付序为先 set（setModel → setThinkingLevel）后 prompt——首轮即跑在新模型/档位上；档位越界的最终裁决在内核 clamp（setModel 随后自行 clamp，实测 DeepSeek 换模即触），UI 显示内核权威值。setModel 失败（未知模型/无凭据）走既有 commandFailed 落错误条，prompt 不阻断。缓存目录可能过期（models.json 变更），由下次 attach 的 attached 帧覆盖刷新；档位菜单按当前选中模型的 thinkingLevels 过滤，越界选择只剩先选档位后换模型的窄窗口，由内核 clamp 兜底。

**边界**：命令目录（扩展/模板/skills）不缓存，Trigger Menu 仍属驱动态功能（浏览态 `/` 不触发）；挂起选择不持久化（刷新即弃，未发送的意图不承诺存活）；Context Ring 仍按「内核 usage 缺席不渲染」口径，浏览态无分母不补；create 出的会话首条消息前不落盘，刷新后详情 404 进错误态，属既有行为。

**后果**：`DriveState` 增 `catalogs` / `pendingChoices` 切片；懒发送待补发序列携 `choice`，兑付序抽纯函数 `pendingSendCommands`（drive-client，已测：先 set 后 prompt、off 档位不被 falsy 吞、不成对不发 setModel）；localStorage 读写全部守卫降级（隐私模式/超限静默，缓存 miss 只是菜单空）；React Hook 纪律提醒——SessionView 的 hook 一律置于提前 return 之前（开发中曾因 hook 落在错误态 return 后触发 "Rendered fewer hooks than expected"，端到端验证逮住）。

## 补记十三（审查修复轮）：在途入列的判定口径、commandFailed 携 command、缓存只留 model

**问题**：代码审查在补记十一/十二的落地里查出三处与规格不符：一是「attach 在途的后续发送入列」实际不可达——乐观注册后会话壳已在驱动表里，`sendText` 的入列分支被 `if (!session)` 挡住，第二条消息会以 `drive prompt` 直发尚未 attach 的 sessionId，服务端回 `sessionNotDriven`，`commandFailed` 反把首条待回显抹掉；二是 `commandFailed` 无条件清 `pendingPrompt`，与补记十二「setModel 失败 prompt 不阻断」相悖——兑付序是先 set 后 prompt，前一帧的切换失败会抹掉首条消息的气泡；三是缓存写的是整个 `SessionCatalog`（含 `commands`），违反补记十二边界「命令目录不缓存」。

**决定**：入列判定改为**先看有没有 attach 在途**（`inflightFile`：先按 file 直查、再按 sessionId 反查），与「会话壳在不在」解耦——乐观注册后 Composer 已切到驱动分支、只传 sessionId，反查是唯一能兜住第二条的路径。协议 `commandFailed` 帧扩可选 `command`（被拒命令的 `type`）；客户端只在文本命令（prompt / steer / followUp）被拒时让待回显与待确认队列让位，`setModel` / `setThinkingLevel` 被拒仅落 `lastError`；帧未携 `command`（旧服务端）按文本命令处理——留下永不回显的气泡比误撤更糟。缓存收窄为 `CachedCatalog = Pick<SessionCatalog, "model">`，投影抽纯函数 `cacheableCatalog`（组装层写穿与 localStorage 灌入共用，旧键里的 `commands` 在灌入时即被剥掉）。另：`sendText` 返回「有没有被接手」，懒接管但连接未就绪时 Composer **不清**输入框与草稿（原先静默丢字）。

**边界**：`inflightFile` 的线性反查在待发送序列只有个位数（同一次 attach 空窗内的连发）时可忽略；缓存投影是有损的——浏览态永远拿不到命令目录，Trigger Menu 仍只在驱动态出现（与补记十一同口径）。`command` 字段对命令类型的枚举是协议知识，新增命令类型时须在 `isTextCommandFailure` 里重新判定。

**后果**：`use-drive` 的乐观状态撤销收敛到一个 `dropOptimistic(ids)`（`failPendingSends` / `failPendingSend` / `release` 三处共用，疑似重复代码就地消除）；`Composer` 的输入区状态由四个互相编码的布尔收敛为一元状态机 `ComposerMode = driven | lazy | foreign | locked`，模型/档位分流抽 `selectModel` / `selectThinkingLevel`；测试补三则（setModel/setThinkingLevel 被拒不抹待回显、未携 command 按文本处理、`cacheableCatalog` 只留 model 切片）。

## 补记十四（浏览态目录兜底）：全局模型目录走 REST——「首次浏览只读」边界修订

**问题**：补记十二把浏览态 Model Seat 押在 per-session 目录缓存上，而缓存只在 attached 帧到达时写入——从未被本端接管过的会话（CLI 创建的历史会话占绝大多数）首次浏览永远无目录，Model Seat 自动禁为只读，「换模型再发」手势对这类会话整体断档。补记十二「首次浏览维持只读」的取舍在历史会话场景下代价过大，且目录的 `models` 列表本身并不强会话特有（来自全局 models 快照按已配置服务商过滤，会话级的只有 current / thinkingLevel 两值）。

**决定**：core 增全局模型目录只读投影（`ModelRuntime.create()` 独立装配，与 createAgentSession 未传 agentDir 的会话运行时同源：同一份本地 auth/models 快照），server 在 pi-data fallthrough 前直连暴露 `GET /api/catalog`，返回缺省 current / thinkingLevel 的 ModelCatalog（`GlobalCatalog`）。客户端浏览态在 per-session 缓存缺席时以全局目录兜底渲染可选菜单（缓存优先——它带会话 clamp 过的档位）；选择仍走挂起选择、首条发送兑付，Send-to-Attach 语义不变。读目录是纯只读操作，不触碰任何会话状态，ADR-0012「浏览路径只读」的本意（浏览不驱动）未被破坏。

**边界**：命令目录当时仍只随 attach 下发（随后补记十五扩入全局目录与缓存）；全局目录不过会话——无「当前模型保留」规则，thinkingLevels 按模型推导（越界的最终 clamp 仍在内核）；服务端每请求新建 runtime（本地快照读取，allowModelNetwork 默认关，无网络刷新），客户端每页加载至多取一次（成功 memo，失败不缓存、重挂载重试，缺席只是菜单空）；per-session 缓存的写穿与 localStorage 续命机制不变，全局目录不落盘。

**后果**：`shared/protocol` 增 `GlobalCatalog`；core 增 `catalog-map`（条目级映射自 pi-session-source 抽出，会话/全局两路共用，已测）与 `global-catalog`（过滤投影，已测）、`globalCatalog` 装配（薄层不单测）；server `main.ts` 增该端点（目录是内核态，不属 pi-data 文件访问层，`json` 助手自 pi-data 导出共用）；app 增 `state/global-catalog`（zustand 切片 + 模块级 memo）与 `pi-client.fetchCatalog`；`SessionView` 浏览态目录改「会话缓存 ?? 全局目录」，GLOSSARY Model Seat 词条同步。另：hook 纪律的一则新变体——「缓存 ?? 全局」最初写成 `useCachedCatalog(id) ?? useGlobalCatalog()` 链在同一表达式里，`??` 短路使缓存命中时少调一粒 hook（attach 完成目录进缓存即崩，"Rendered fewer hooks than expected"）；两粒 hook 须各自无条件调用、求值后再合并。

## 补记十五（命令目录兜底）：全局目录扩入 commands，Trigger Menu 浏览态可用

**问题**：补记十四把全局目录限定在 models，Trigger Menu 因此仍属驱动态——浏览态输入区常开（Send-to-Attach），但 `/` 无菜单、加号不渲染，命令的手势对历史会话断档；而命令目录的两类菜单源（prompt 模板与 skills）来自 `ResourceLoader`，本就可独立于会话装配，随 attach 下发只是实现路径而非必要耦合。

**决定**：`GlobalCatalog` 扩入 `commands`（只含 prompt 与 skills——扩展命令需会话内运行器且本就不入菜单），core `globalCatalog()` 装配改「ModelRuntime + DefaultResourceLoader（server 进程 cwd）」，与 pi CLI 同目录启动同源；per-session 缓存同步扩界收 `commands`（`CachedCatalog` 改 `Pick<SessionCatalog, "model" | "commands">`，补记十二「命令目录不缓存」边界废止）——会话缓存是会话所属项目的命令，比 server cwd 的全局投影更贴切，全局目录只兜首次浏览的底。浏览态选中命令落 Command Chip，随首条发送 attach 后由内核解释：会话 cwd 无此命令时走既有 commandFailed 错误条（与挂起模型选择兑付失败同构）。

**边界**：Composer 的触发检测条件由「已驱动」放宽为「可输入」（driven / lazy 两态），他属驱动与不可驱动仍不触发；加号以「可输入且有命令可选」在场；驱动态目录仍以 attached 帧为准（新鲜且含扩展命令全集），缓存与全局投影只在浏览态消费。挂起选择（模型/档位）机制不变。

**后果**：core `catalog-map` 增 `promptCommandOf` / `skillCommandOf`（会话与全局两路共用，已测）、`global-catalog` 增 `globalCommandEntries` / `CatalogResourcesLike`（已测）；`globalModelCatalog` 改名 `globalCatalog`；app `drive-client.cacheableCatalog` 带 commands 切片（启动灌入的旧完整 SessionCatalog 经收窄自动迁移）；`Composer` 命令目录改「attached 帧 ?? browsingCatalog.commands」，GLOSSARY Trigger Menu 词条同步。

## 补记十六（审查修复轮）：单客户端租约取代 session 级锁

**问题**：阶段四落地时按「协议多路复用」实现了 session 级互斥——`SessionRegistry` 认文件级属主，同一 JSONL 二次 attach 抛 `sessionAlreadyDriven`，客户端再配一套静默退避重放（2s→32s 五次）去等属主心跳宽免窗。实测这套机制在「一个浏览器、多个标签页」的真实用法下全是负收益：同机会话共享同一份 pi 数据面，第二个标签页既做不到独立驱动（内核只允许单写者），又因为整页不渲染而连只读浏览也拿不到；而那套退避重放要盖过 60s 心跳窗，用户看到的是长时间无反馈的错误条。审查另指出 `isFileDriven` 的拒绝分支在单租约下已不可达，成了死代码。

**决定**：互斥上移到连接级——**一个 server 进程同一时刻只服务一个控制连接**（GLOSSARY: Server Lease）。`wss.on("connection")` 若已有存活持有者，立刻回 `{type:"error", code:"serverBusy"}` 并关闭该连接；持有者连接消亡即释放租约，故刷新可立即重连；持有者心跳超期（代理后的半开连接，close 可迟到数分钟）判为僵尸，新连接先 `evict` 其全部属主与订阅再让位。客户端收到 `serverBusy` 按既有重连退避短重试少量次数（覆盖刷新窗口），用尽后停在整页阻断态，由用户关掉另一窗口后点「重试」——不无限抢占。

随之删除的：`DriveErrorCode` 的 `sessionAlreadyDriven` 与全部文案、`SessionRegistry.open` 的文件级拒绝分支、客户端的 `replayFiles` / `replayAttempts` / `scheduleReplay` 全套退避。保留的：`isFileDriven` / `sessionOf` 作为查询（REST 的 `driven` 标志与 gateway 的 attach 幂等重放仍用），协议按 sessionId 多路复用不变（同连接内多 session 仍并行）。

**边界**：租约是**进程内**的单写者保证，不跨进程——与 pi CLI 并发驱动同一 session 仍只 best-effort 互斥（「属主标记仅存内存」的原决定不变）；判定「存活」用心跳窗口而非操作系统级连接状态，故僵尸接管最坏要等一个心跳周期。整页阻断态下第二窗口失去只读浏览能力，这是明说的取舍：与其给一个半可用界面，不如说清「本服务已被占用」。多个服务实例（不同端口）各持租约，互不影响。

**后果**：`ws-gateway` 的连接生命周期收敛为一个 `evict(socket)`（close 与租约让位共用，属主守卫就地消除重复），`handleFrame` 不再需要 `owned` 集合；阻断页复用 `components/EmptyState`（新抽的 Base Component，同时收编 Home / SessionView / Transcript 的三处同款空态），Brand Float 增 `idle` 形态以满足 ADR-0009「无例外常驻」；客户端租约重试复用既有的 `reconnectDelay` 退避，不再有第二套定时器与 1200ms / 3 次魔数。测试改为：第二连接必被拒且首连接不受影响、持有者断开后可接管、**心跳超期的僵尸被让位且其迟到 close 不误释放新属主**（后者重建了被删的守卫覆盖）。
## 补记二十（架构收敛轮）：DriveClient 注入缝与 in-flight 簿记单账本

**问题**：客户端编排层（`use-drive.ts` 的 DriveClient）直接 `new WebSocket` / `window.setTimeout` / 读 `location`，无任何注入缝——重连退避、重放、attach 竞态、在途兑付全在这层，却完全不可测（此前文件头明文「组装层不做单测」）；补记十三的三个审查 bug 全诞生在这里。簿记侧，`pendingSends`（file 键 Map）与 `pendingCreates`（FIFO 数组）是两套平行账、`failPendingCreates / failPendingSends / failPendingSend` 三个失败函数同构异码。

**决定**：两条注入缝——`DriveClientDeps { socketFactory?, schedule?, cancel? }`，缺省真 WebSocket + 全局定时器；无浏览器全局且未注入时 `connect()` 跳过（node 导入安全），`DriveClient` 类转导出、测试经 `new DriveClient(deps)` 用假 socket + 可手推时钟穿过接口测（重连退避序列、attach 在途入列、懒发送兑付、断线语义等编排契约，`use-drive.test.ts`）。簿记收敛为 `lib/inflight.ts` 单账本（`InflightBook`）：懒发送与 create 待定应答的登记与兑付一处声明，兑付一律「取出并返回」，副作用（撤乐观壳、发帧）归调用方——账本不碰 store、不持连接，三胞胎 fail 函数消失。行为零变化，纯归约层（drive-client）不动。

**边界**：`pendingPrompt / pendingQueue / pendingChoices` 不入账本——它们已是已测纯接口（applyEvent 归约、store 切片）的一部分，搬动只是挪位置；「inflight 账本」收拢的仅是编排层的登记与兑付表。

**后果**：文件头「组装层不做单测」的旧口径废止；server 侧的 WS 半边集成测试（ws-gateway.test）与客户端编排测试自此分工对称。

## 补记二十一（架构收敛轮续）：SessionHost 收缩为 dispatch 单入口，错误 policy 一处定

**问题**：SessionHost 的命令接口是 PiSessionLike 的逐方法镜像——10 个方法、10 段同构的转发加 catch；等/不等策略（prompt/abort/compact 不等、steer/followUp/setModel 等）与错误转应答住在 server 组装层 `main.ts` 的 switch 里，同一命令枚举在四个包各抄一遍（新增一个命令横跨四包 30+ 触点）。错误信号双轨：steer 失败 `SessionHost.fail` 落 error 事件、组装层又把 failed 转 commandFailed 帧——客户端两处分别动 pendingPrompt。

**决定**：SessionHost 命令面收缩为单一 `dispatch(body): Promise<DriveOutcome>`，策略表在 dispatch 一处定——fire-and-forget（prompt / abort / compact）立即回 ok、被拒不发应答只落 error 事件（事件流是唯一反馈通道）；待应答（steer / followUp / setModel / setThinkingLevel / clearQueue）被拒**只**回 `{ok:false}`（传输层转 commandFailed 帧），不再另发 error 事件，双轨消除；setModel / setThinkingLevel resolve 后的 drain 随迁入 dispatch（原 setModel 方法内）。`DriveOutcome` 形状随之归协议层（shared/protocol，core 与 server 两端共用）；「哪些命令承载文本」定为协议层谓词 `isTextCommand`（prompt / steer / followUp，undefined 按文本处理）——app 归约层的手抄枚举 `isTextCommandFailure` 删除，改消费协议谓词；新增命令类型必须先在谓词处归类。

**边界**：PiSessionLike 不动——它仍是内核接缝（pi-session-source 适配器 + 测试 fake 双适配器），SessionHost 只是把「命令怎么转发、失败怎么落点」从调用方挪进实现吸收；clearQueue 失败的应答从「error 事件 + ok」统一为 commandFailed（原语义不一致，属收敛的修正而非行为漂移）。

**后果**：新命令扇出减半——组装层 switch 消失（`driveCommand` 只剩「未驱动会话」守卫），SessionHost 方法面不再随命令集增长；session-host.test 命令用例全部改走 dispatch。

## 补记二十二（架构收敛轮）：派生出口内开增量缝，delta 帧只重算尾部

**问题**：applyEvent 对每个 delta 帧返回新 DriveSession，驱动画面的合成链（mergeEntries → activeLeafId → buildTranscriptModel）每帧全量 O(n) 重建。实测 1500 条目会话下每帧 3.06ms——30 帧/秒的流式即 ~92ms/s CPU 常驻，5000 条目会话线性放大到 ~10ms/帧。「瞬态帧只应惊动草稿叶」此前靠各消费点自律，不是结构保证。

**决定**：buildTranscriptModel 内开增量缝——模块级单槽缓存按帧判据续算，判据不满足即整体重建（全量路径与旧实现逐行同构）：

- **瞬态入参引用稳定化**（判据的前提）：待回显条目按（文本 × 挂靠点）记忆化（时间戳冻结在首次挂出时刻——发送时刻本就该定格）、liveTools 按 streamingToolCalls 引用记忆化；出口侧另有内容同值折叠（liveTools / draft 换引用不换内容不作失效）。
- **分支链线性延展检查**：新尾部每个非 session 条目的 parent 必须等于链尾 id（权威条目与瞬态叠加都挂叶子）——中途分支点 / 挂弃枝即放弃增量；链元素携带原始数组下标，raw 前缀分歧可映射回链下标。
- **预扫表只增不删**：条目 id 全局唯一永不复用，尾部换帧后旧尾残留键无害，从链分歧点续扫即可。
- **turn 按 checkpoint 回退重建**：构建态住 TurnsBuilder，仅在 turn 关闭（user 边界）打点；delta 帧的分歧点落在末轮（待回显 + 草稿），恢复到该轮起点只重算尾部那一轮。

实测同会话 delta 帧均 3.06ms → 0.19ms（16 倍；30 帧/秒 CPU 92ms/s → 6ms/s）。

**边界**：「全量与增量产出深度一致」由增量等价测试锁定（append / 尾部换帧 / 分支切换 / liveTools 折叠 / 截尾清空五组逐帧比对）；liveTools 内容变化仍全量重算（运行中调用可能在任何已关闭轮——按内容判据折叠后仅真变化帧重建）。Live Tail 路径与驱动路径共享同一条缝（轮询追加同样走增量）。

**后果**：接口签名不变（buildTranscriptModel 三参照旧）；调用方无需感知增量——「同一出口」的 ADR 原决定不被破坏。

## 补记二十三（架构收敛轮）：属主单表——registry 记账，gateway 只路由与投喂存活

**问题**：「属主」一个概念两个真相源——gateway 的 owners Map（socket 维度）与 registry 的 registrations（file/sessionId 维度），靠调用序维持一致；attach 判定横跨两包（gateway 先查 registry 再查自己的表，再手工编排 release + owners.delete + unsubscribe 三步）；close 时还要加「别释放新属主会话」的僵尸迟到守卫。「属主 = 连接」的 bug（浏览器刷新残留标记，补记六前身）已在这条双记账上发生过一次。

**决定**：属主身份收进 registry 单表——`OwnerToken`（传输连接的透明对象，只要求身份比较）随 attach / create 入册，登记项带心跳存活位；registry 新增窄投影 `ownerOf / isOwnerAlive / markAlive / markDead / releaseByOwner`。gateway 删 owners Map，降为纯路由（subscriptions）+ 心跳传感器：tick 里 ping 后 `markAlive`、terminate 前 `markDead`；活属主拒绝与僵尸接管都由 `registry.open` 按存活位判定（僵尸先在 gateway 摘其订阅路由）；连接 close 走 `releaseByOwner`——新属主接管后登记的 owner 已换人，迟到 close 的守卫由单表结构性保证（原「别释放新属主会话」的手工守卫删除）。

**边界**：「属主标记仅存内存」「属主生命周期是连接」「对 pi CLI 仅 best-effort 互斥」三条原决定全部不动——本补记只挪动记账位置，不换语义。同连接重放的幂等判定改读 `ownerOf`（连接对象同一性）；同连接重复 attach 穿透到 registry 属异常流，以 sessionConflict 拒绝。

**后果**：第三个「等 attached」路径（fork / 恢复）或 desktop IPC 适配器到场时，属主语义随 registry 直接复用；心跳 terminate 路径首次有测试覆盖（isLive 注入 + heartbeatMs 40ms 真实 tick）；ws-gateway.test 的 fake deps 升级为属主单表语义的窄投影。

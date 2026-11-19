# zustand 作为前端全局状态层

前端此前以三种机制分发状态：模块单例 + useSyncExternalStore（Drive WS 状态）、组件级 state + props 逐层下传（sessions 列表、session detail）、localStorage + CustomEvent 订阅 hook（主题/语言/视图模式）。侧边栏要接运行状态（GLOSSARY Running Indicator）时暴露了粗粒度订阅的短板：任何一条流式 delta 都会换掉整个 DriveSession 快照，所有订阅者随之重渲，selector 级订阅没有现成答案。

决定引入 zustand v5（vanilla + react）作为唯一全局状态订阅层：DriveClient 的存储壳（sessions Map）一步换成 zustand vanilla store——WS 连接、重连退避与 applyServerFrame 归约（ADR-0012）不动，use-drive.ts 订阅端 hooks（useDriveSessions / useDriveSession / useConnectionError，及按 Running Indicator 需求新增的 useDriveLive）全部改为 useStore + selector 订阅；sessions 列表及其 5s 轮询迁入 store 模块，由消费端直订（Sidebar / Home / MainShell 经 useSessions / useSessionSummary / useProjectGroups，App 自身不再订阅）。session detail 保留 Outlet context：它是路由作用域的 per-id 状态，context 就是它的接缝，进全局反而引入缓存失效问题。主题/语言/视图模式的 localStorage 旁路暂不收编（无 props 痛点），收编走 zustand persist，列第二期。

订阅口径一条：**数据走 props，状态走订阅**——TranscriptModel 等派生快照与动作对象（ComposerDrive：状态徽标 + 命令闭包）仍经 props 传递，DriveStatus 等全局状态由组件 selector 直订，props 链不再中转裸状态。

## 考虑过的选项

- **继续手写 store**：selector 记忆化与引用稳定的样板随消费面增长递增，且已在粗粒度订阅上吃亏。
- **Jotai**：原子化模型与「以 Session 为单位」的 store 形状不合。
- **React Context**：整树重渲，恰是本次要避免的。

## 后果

- 全应用单一订阅范式，手写 useSyncExternalStore 订阅退场。
- zustand 进入 packages/app dependencies：依赖级决定，退场需整体迁移。
- connectionError 清位语义顺带收紧：原实现清位后若 session 归约无变化则不通知，错误条滞留至下次 publish；现清位即通知、错误条即时消失（修复而非等价迁移）。
- sessions 轮询的启动时机从「根 App 挂载即跑」变为「随首个消费端挂载」：深链直达设置壳时轮询不跑，回主壳才首刷——设置壳不消费该 store，属可接受差异。

## 补记（架构收敛轮）：ComposerDrive 搬运层拆除——修订订阅口径

**问题**：正文订阅口径点名「ComposerDrive（状态徽标 + 命令闭包）仍经 props 传递」，但 Drive 数据本就是全局订阅层（drive.store）的数据——16 字段的 ComposerDrive 是 DriveSession 切片与 DriveClient 方法的逐字段镜像，由 SessionView 每渲染内联新建（Composer 因此只能写 `[drive != null, …]` 这类亮度技巧自保 memo 依赖）；每个 delta 帧换新 DriveSession，composerDrive 对象随之重建，props 通道成了高频重渲的放大器。ADR 自己的动机（props 链不再中转裸状态）在这里反向成立。SessionView 退化为 30 行纯搬运，Transcript 原样透传——新增一个 DriveSession 字段要连改四处。

**决定**：ComposerDrive 收缩为 ComposerActions（纯动作接口，闭包只绑定路由 id，useMemo([id]) 稳定），DriveSession 切片与 attach 在途由 Composer 经 selector 直订；props 只余动作对象与两个模式输入（foreignDriven / takeover）。attach 在途以新切片 `attaching`（sessionId 集合）进 store——它是 inflight 账本（ADR-0012 补记十六）的响应式镜像，账本仍是唯一真相源；ComposerMode 判据随之纳入 attaching，五态显式状态机抽为纯函数（lib/composer-mode，已测）：driven / attaching / lazy / foreign / locked。Transcript 不再透传状态对象。

**边界**：TranscriptModel 等派生快照仍走 props（口径不变）；连接就绪度不入状态机——断线时输入区依设计保持可用（乐观回显顶住、重连重放续发），就绪与否只在发送瞬间由 sendText 兜底，不改变任何渲染分支。

**后果**：新 DriveSession 字段对 Composer 零改动（直订）；delta 帧不再经 props 链放大重渲；「数据走 props，状态走订阅」修订为「派生快照走 props，store 切片直订，动作走 props」。

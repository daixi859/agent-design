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

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

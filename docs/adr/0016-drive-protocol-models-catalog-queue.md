# 驱动协议扩展：模型切换、目录下发与队列整批重编

输入框重设计（Model Seat、Context Ring、Trigger Menu）需要 ADR-0012 阶段一明确延后的「模型与 thinkingLevel 切换」，本 ADR 将其转正。内核 `AgentSession` 本就具备 `setModel` / `setThinkingLevel` / `getAvailableThinkingLevels` / `getContextUsage`，接入是 core 接缝活，不是内核改造。协议扩展四条：

- **命令**：`setModel {provider, modelId}`、`setThinkingLevel {level}`（均仅会话级，不暴露持久化选项）、`clearQueue`（清空两条队列；清空结果经既有 `queue` 事件回推，命令不回传内容——客户端本就持有全量列表）。
- **`attached` 帧扩 `catalog`**（`SessionCatalog`）：`model`（provider 分组的模型列表，每模型带可用 thinking 档位与 `contextWindow`，附当前选中与档位）与 `commands`（扩展命令、prompt 模板、skills 三类透传目录；少量客户端映射的内建不经协议）；重 attach 即刷新，不做增量更新。**用量快照（`usage`，内核 `getContextUsage()` 投影）同帧携带**——内核这个 API 是拉取式的，宿主构造期还没有订阅者，初始值随事件发必丢（与 ADR-0012 补记二「快照只随 attach 帧走」同一时序坑）；此后在条目边界随 drain 推送 `usage` 事件。
- **模型切换只落盘不推送**：内核在 `setModel` 上仅由 sessionManager 直写 `model_change` entry、不发 session 事件（`thinking_level_changed` 有事件——两者不对称，实测于内核源码）。core 在 `setModel` / `setThinkingLevel` 返回后主动 drain 新条目，UI 权威照旧走 entry 流，不为此新增事件类型。
- **队列行内操作不走内核新 API**：内核 `PendingMessageQueue` 只有入队与清空全部，逐条删除/编辑/提升不存在（连 pi TUI 的 Alt+Up 都是「清空 + 整批还原进编辑器」）。客户端以 `clearQueue` + 按 `queue_update` 全量列表逐条重入队实现（**整批重编**）：被提升的条目以 steer 重入（即 Queue Dock 行内「插话」），其余按原通道原序重入。清空与重入队之间的投递竞态窗只出现在轮边界，窄且可容忍；中断不清队列是内核既有行为，Queue Dock 依赖它。

## 考虑过的选项

- **硬编码模型表与窗口大小**：立刻能用但会腐烂，且 `setModel` 命令反正要加，弃。
- **内核加逐条队列 API + dsh 式 `updateQueue{itemId, action}`**：语义最干净、无竞态（host 权威）；但 pi 是 npm 上游依赖（`@earendil-works/pi-coding-agent`），要走 pnpm patch / fork / 上游 PR，卡本轮交付。记为对 pi 的上游贡献候选，就位后 Queue Dock 行语义不变、无缝升级——这是明示的升级路径，不是现状。
- **复刻 pi TUI 的斜杠 if-chain**：内核 `prompt()` 只解释扩展命令、`skill:<name>` 与 prompt 模板三类，内建命令是 TUI 层专属（headless 下 `/model xyz` 就是发给模型的纯文本）。web 端透传三类 + 少量客户端映射（如 compact）已覆盖需求，全量复刻维护重且多数命令对 viewer 无意义，弃。

## 后果

- 修订 ADR-0012 的延后清单：模型与 thinkingLevel 切换转正；fork、扩展交互、工具审批仍延后。
- `contextWindow` 由目录下发后 Context Ring 才有分母；目录未达前环不渲染（与 dsh 同口径）。
- Trigger Menu 的内建映射面（compact 等）是客户端知识，pi 上游若提供 headless 命令面即可归还。

## 补记（Model Seat 验收轮）：模型目录收窄为已添加的服务商

正文「provider 分组的模型列表」落地时补三处明文：

- **目录只列已添加（配置过凭据）的服务商**：内核 `getAllModels()` 是 models.dev 全集，未配置的服务商模型既切不过去（`getModel` 未配凭据即 throw）也不该入眼。core 映射层按 `hasConfiguredAuth(provider)` 过滤（「已添加」的内核口径），当前模型始终保留——会话正跑在它上面，不因凭据判定时序而消失。切换仅会话级的语义不变。
- **条目扩 `providerName`**（可选，内核 `Provider.name`）：分组头展示服务商名而非裸 id；同名同 id 时缺省。客户端 ModelSeat 按 provider 首现顺序分组渲染，搜索连服务商名一起匹配；行级 provider 描述随分组头退役。分组头为分割线式（短分割线 — 服务商名 — 通栏分割线），搜索框在长列表滚动时吸顶。
- **条目扩 `supportsImages`**（可选，内核 `Model.input` 含 `"image"`）：Model Seat 行内图片输入徽标，读者据此判断能否贴图提问；纯展示，不做交互过滤。

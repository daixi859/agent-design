# Transcript 按 Turn / Tool Group 三层折叠渲染

用户在验收后重构信息层级：**Turn**（一条 user 消息到下一条 user 消息之间的全部内容）为顶层单元；Turn 内以 assistant 的 **text 回答为分隔符**，每段连续非文本内容（thinking、toolCall+配对 toolResult、bashExecution，可跨多条 assistant 消息）归为一个 **Tool Group**。渲染为三层：轮级聚合条（默认折叠，显示 `N steps · M thoughts`，点击展开全部组条）→ 组条（默认折叠，显示 `k tools · t thoughts`，点击展开）→ 单条目（现有工具卡/思考卡，左缩进 + hairline 竖线体现层级）。同时收缩 ADR-0004 的注解级清单：删除 `model_change` 与 `thinking_level_change`（模型切换信息与时间不再出现在对话流，token/成本只在顶栏汇总），`session_info` 仅首次命名渲染为注解；assistant 页脚整体删除，仅保留 `Aborted` / 错误警示。本 ADR 修订 ADR-0004 的注解级与消息级边界。

## 考虑过的选项

- **无顶层 UI、仅组条平铺折叠**：缺少「收起一切」的入口，长工具链会话的默认视图仍太吵。
- **按 assistant 消息切组**：同一条消息内 text→toolCall→text 的穿插会被硬切开，违背「以回答分组」的直觉。

## 后果

- `AssistantMessageView` 退役：text 块成为 Turn 内的平铺回答，不再有消息级容器与页脚。
- Live Tail 追加新内容时，新 Tool Group 以折叠组条出现在聚合条计数内，不打断已展开状态。
- 层级由缩进 + hairline 竖线表达，不引入新底色，维持 Claude 式轻量观感。

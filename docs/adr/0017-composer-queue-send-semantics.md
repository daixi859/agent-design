# Composer 重设计：排队发送与状态化占位

输入框从「pills 罗列状态」改为「动作与状态各归其位」（pi × deepseek-harness 对照调研见 [research/input-box-survey.md](../research/input-box-survey.md)）。移除全部统计与状态 pills（工具数、running / retrying / compacting / calling、queued 计数）与「追问」按钮。运行态改由三处表达：

- **Transcript 本身**：运行组本就在流里（TUI 模式钉在滚动区底部，ADR-0014）；
- **Stop 按钮**：方形图标，tooltip 标出 Esc, Esc；双击 Esc（500ms 窗口）等价触发；中断**保留队列**（内核 abort 本就不清队列，ADR-0016）；
- **状态化占位符**：compacting → 「正在压缩上下文…」且发送禁用（内核本就拒收）；retrying → 「重试中（第 n 次）…」，Esc 取消走现有 `abort`（内核 abort 在 retrying 期即取消重试）。

发送语义改线（修订 ADR-0012 补记六的「sendText 固定带 `"steer"` 兜底」）：idle → `prompt`（竞速兜底改带 `"followUp"`——命中广播窗口时消息**排队**而非插话，与新默认一致）；运行中 → `followUp`（排队，进 Queue Dock）；Queue Dock 行内「插话」与 Ctrl/Cmd+Enter → `steer`。补记六确立的「prompt 不承担守门职责」不变，变的只是兜底与默认通道。

其余明文子决定：

- **Trigger Menu 仅行首触发**（任意行的首个非空字符为 `/`），不做词边界检测与 URL 例外。
- **Command Chip 一次到位**（dsh 全套：原子片段、ghost 提示、删除即退、claimed 期菜单关闭）：本轮命令面是 skill 与 prompt 模板，参数本属自然语言，chip 看似过重，但为后续结构化命令（参数 popupSelect 类扩展）预留，避免返工。**明示例外**：chip 在运行中提交会转 followUp 排队，而内核排队路径不做斜杠展开——该罕见路径下命令以字面文本送达；绝大多数命令在 idle 提交（经 `prompt()` 正常解释），上游提供 headless 命令面后可归还。
- **Model Seat 常可用**：sending / compacting 冻结输入时模型与 thinking 两粒按钮保持可用，内核拒绝经 commandFailed 机器码落既有 lastError 错误条（全仓唯一错误出口，toast 等浮层设施出现后再升级）；切换仅会话级（落 `model_change` / `thinking_level_change` entry），不做「存为默认」。
- **Context Ring 底栏右端、阈值变色**（>70% 警告、>90% 危险），hover 经 HoverCard 展开详情；分段明细条不做（`UsageInfo` 无 system/tools/messages 口径，内核 footer 也不做）。
- **草稿按会话持久化**（localStorage 语义快照，恢复不抢焦点）；输入历史 ↑/↓ 不做。
- **TUI 模式层叠**：自上而下「钉住的运行组 → Queue Dock → Composer 卡」，运行组仍钉滚动区底部，不破 ADR-0014。
- calling 徽标移除后，并行工具调用不再有 composer 侧指示（`streamingToolCalls` 集合仍供 TUI 运行行与草稿使用，ADR-0012 补记八）。
- @ 文件提及、图片附件、fork 不进本轮（各需 server / core 新面），backlog；菜单结构留触发字符扩展点。

## 考虑过的选项

- **pi 式中断即整批还原回编辑器（Alt+Up 思想）**：队列内容与编辑器文本二选一，认知重；保留队列 + 行内操作更直接，弃。
- **dsh busyEnter 用户偏好（queue | steer）**：单默认（排队）+ 显式插话手势已覆盖，偏好设置等真需求再加。
- **环 hover 用原生 `title` 降级**：承载不了富详情，等于砍掉需求本体；MenuSurface / Tooltip / HoverCard 三件套一次建齐（Base Component）。

## 后果

- Base Component 新增 MenuSurface / Tooltip / HoverCard；散装「chip」样式收敛到 Command Chip。
- i18n「追问 / 追加」退役（GLOSSARY 已收词：Steer=插话、Follow-up=排队），en/zh 同步换词。
- `ComposerDrive` 面收窄：`callingTool` / `queuedCount` 等只读徽标字段退役，队列内容改经 store 订阅（ADR-0015 selector）。

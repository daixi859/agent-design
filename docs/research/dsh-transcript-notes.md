# DSH transcript / 消息渲染与视觉语言 · 调研笔记

> 用途：把 DeepSeek Harness（下称 DSH）的 transcript 视觉语言重绘到 Pi Studio（React + Vite + CSS Modules）时的参照。
> 源码基线：本地 checkout `D:\workspace\github-trending\deepseek-harness`（git checkout，本次全部证据取自这里）。
> 下文所有路径除特别说明外均为该 checkout 下的**仓库相对路径**；证据格式 `文件:行号`。
> 安装版 `C:\Users\DELL\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\` **不可直接读**（`Test-Path` 为假：asar 是打包归档，不是目录）。同名 `app.asar.unpacked\dsh\` 只含 `node_modules`（1666 个文件，全部是 native/office 依赖），**没有任何客户端源码或 CSS**。结论：笔记完全以本地 checkout 为据；asar 内取源码需 `npx asar extract` 之类工具，本次未做（任务允许忽略）。

---

## 1. 仓库结构总览

### 1.1 包划分

- pnpm workspace：`pnpm-workspace.yaml:1-15`，成员为 `vendor/*`、`packages/*/*`（两段式包路径）、`apps/*`、`benchmarks`、`website` 等。
- 包名规则见 `AGENTS.md:19-70`：`@deepseek-ai/dsh-<pkg>`，包按组落在 `packages/<group>/<pkg>/`。**注意 `packages/client` 是包组目录，不是包**。
- 客户端包（`packages/client/` 下的包目录，共 70+，节选与 transcript 相关的）：`ui-conversation`、`ui-chat`、`ui-tool`、`ui-primitives`、`ui-theme`、`ui-renderer`、`ui-slots`、`ui-message-feedback`、`ui-trajectory`、`ui-agent-team`、`ui-plan`、`ui-user-questions`、`ui-layout`。
- `apps/web` 只是 Web 壳：`apps/web/src/` 下仅 `main.ts`、`preview.ts`、`node-module-stub.ts`、`vite-env.d.ts`（证据 `apps/web/src/main.ts`）。真正的 UI 全在 `packages/client/*`。架构分层见 `docs/subsystems/web-client.md:9-18`（Host → Transport → Client model → UI adapter → Conversation → Slots → React）。

### 1.2 transcript / 消息渲染代码住在哪

| 目录 | 职责 | 关键证据 |
|---|---|---|
| `packages/client/ui-conversation` | **目标无关的装配层**：事件/视图注册表、Turn/Step Location、增量 Context 汇编、共享 shell 与输入编排；定义"事件 → 节点"的 reducer | `docs/subsystems/conversation.md:5-22`；`packages/client/ui-conversation/src/client/conversation/assembler.ts` |
| `packages/client/ui-chat` | **Chat 目标的业务 Definition + 最终快照 + 渲染**（消息渲染主战场） | `packages/client/ui-chat/src/client/conversation-nodes/`、`.../chat/` |
| `packages/client/ui-tool` | 工具调用卡：`ToolCallTree` → `ToolRow` → 各类 toolview（bash/diff/read/search/web/office/todo…） | `packages/client/ui-tool/src/client/tool/` |
| `packages/client/ui-primitives` | 共享原子：`DisclosureRow`、`MarkdownText`、`CodeBlock`、`TerminalBlock`、`DiffBlock`、`ReadBlock`、`SearchBlock`、`WebBlock`、`StateDot`、`TextShimmer`、`icons/` | `packages/client/ui-primitives/src/` |
| `packages/client/ui-theme` | `--dsw-*` 设计令牌、字体阶梯、阴影/圆角/滚动条、图标 sprite | `packages/client/ui-theme/src/styles/` |

关键词落点：带 `transcript` 的文件名只有偏好行与旧笔记，渲染实体叫 **Conversation / Chat Node**，不叫 transcript-view。

- `packages/client/ui-chat/src/client/transcript-view.ts`（视图偏好，非渲染）
- `packages/client/ui-chat/src/client/settings/TranscriptViewRow.tsx`

---

## 2. 消息数据模型（事件 → UI 列表的归约）

### 2.1 归约在哪

两级归约，全部是**纯函数式增量 reducer**，不含 React：

1. **事件 → Conversation Node**（ui-conversation 的 Assembler 调各 Definition 的 `match/start/update`）
   - 引擎：`packages/client/ui-conversation/src/client/conversation/assembler.ts`
   - 每个业务包注册 `ConversationNodeDefinition`：`ui-chat` 的在 `packages/client/ui-chat/src/client/conversation-nodes/*.ts`，注册入口 `.../conversation-nodes/register.ts`。
   - 说明见 `docs/subsystems/conversation.md:11-22`（Event Definition / Context / Location / View Definition / Group Definition / View 六概念表）。
2. **Conversation Node → Chat 渲染单元**（Chat 的 snapshot builder + Group Definition）
   - `packages/client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts`（48KB，构建最终快照）
   - 分组：`.../conversation-nodes/process-groups.ts`、`.../contract/process-groups.ts`、`.../contract/group-tree.ts`

### 2.2 原始事件层的内容块判别联合

`packages/client/ui-conversation/src/client/contract/records.ts:33-39`：

```ts
export type AssistantBlock =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; attachment: ImageAttachmentRef }
  | { kind: 'tool-call'; callId: string; name: string; argsRaw: string }
  | { kind: 'other'; block: unknown }
```

工具块生命周期（`records.ts:272-315`）：

```ts
interface ToolCallHead { callId; parentCallId?; name; turn; step; time; subCalls; args: ToolArgs }
export interface PreparingToolCall extends ToolCallHead { readonly phase: 'preparing' }
export interface StartedToolCall  extends ToolCallHead { readonly phase: 'start'; readonly argsRaw: string }
export type RunningToolCall = PreparingToolCall | StartedToolCall
export type ToolCallBlock  = RunningToolCall | ToolResultNode   // ToolResultNode.kind === 'tool-result'
```

`ToolResultNode`（`records.ts:163-185`）字段：`kind:'tool-result', seq, time, callId, parentCallId?, name, args, call, callTime, content, isError, error?{name,code,reason?}, meta?, subCalls`。

会话级节点联合 `ConversationNode`（`records.ts:258-270`）：`UserMessageNode | AssistantMessageNode | SteeringMessageNode | ContextMessageNode | ModelRetryNode | TurnErrorNode | TurnMaxTokensNode | ToolResultNode | CommandNode | CompactionSummaryNode | UnknownSurfaceNode`。

### 2.3 归约后的 Chat 条目判别联合（这就是 UI 列表的 kind）

类型注册机制是 **declaration merging**：`packages/client/ui-chat/src/client/contract/chat-nodes.ts:24-35`，各 Definition 用 `declare module '../contract/chat-nodes.ts' { interface ChatNodeDataMap { ... } }` 追加自己的 kind；`ChatNodeKind = Extract<keyof ChatNodeDataMap, string>`。

| kind（`ChatNodeDataMap` 键） | payload 类型 | 字段 | 声明处 |
|---|---|---|---|
| `user` | `ReferencedUserMessageNode` | `kind, messageId?, seq, time, content, source`（+`referenceLabels/skillNames` 投影） | `ui-chat/src/client/conversation-nodes/message.ts:33-44` |
| `steering` | `ReferencedSteeringMessageNode` | 同上 + `batchStart?` | 同上 |
| `context` | `ContextMessageNode` | `kind, seq, time, content, source, producer, form` | `records.ts:102-113`；映射见 `message.ts:33-44` |
| `turn-trigger` | `ContextMessageNode` | 同上（通知/手动续跑开启一个 Turn） | `message.ts:33-44` |
| `assistant-step` | `AssistantChatData` | `status:'running'\|'settled'\|'interrupted', turn, step, blocks, time, usage?, finalNode?` | `contract/chat-nodes.ts:37-51`；注册 `conversation-nodes/assistant.ts:15-20` |
| `tool-call` | `ToolChatData { root: ToolCallBlock }` | 根调用 + 递归 `subCalls` | `contract/chat-nodes.ts:53-56`；`conversation-nodes/tool.ts:12-17` |
| `command` | `CommandNode` | `kind, seq, time, commandId, name, args, outcome:'success'\|'error'\|null` | `records.ts:234-256` |
| `manual-compaction` | `ManualCompactionChatData { command, compaction }` | — | `contract/chat-nodes.ts:58-62` |
| `compaction` | `CompactionSummaryNode` | `kind, seq, time, summary, summaryEventSeq, shadowedItemCount, shadowedTokenCount` | `records.ts:194-209` |
| `inherited-history` | `Record<never, never>` | 无 payload（分叉继承历史的分隔线） | `conversation-nodes/inherited-history.ts:5-10` |
| `model-retry` | `RetryChatData { attempts, current }` | `ModelRetryNode` 带 `retryState:'scheduled'\|'started'\|'cancelled'`、`delayMs`、`retry`、`maxRetries`、`mode`、`failure` | `records.ts:116-126` |
| `turn-error` | `TurnErrorNode` | `kind, seq, time, turn, step, message, code?` | `records.ts:133-149` |
| `turn-max-tokens` | `TurnMaxTokensNode` | `kind, seq, time, turn, step` | `records.ts:152-160` |
| `turn-process` | `TurnProcessChatData` | `turn, controlAnchorSeq, processStartSeq, answerAnchorSeq, answerStep, inlineReasoning, messageCount, toolCallCount, subagentCount` | `contract/chat-nodes.ts:106-117` |
| `turn-tail` | `TurnTailChatData` | `turn, seq, time, closing: FinalAssistantChatData\|null, branchUnavailable, tokenUsage?` | `contract/chat-nodes.ts:93-104` |
| `system-prompt` | `{ text, update? }` | 完整系统提示（默认**不渲染**，见 `ui-chat/README.md:60-62`） | `conversation-nodes/request-prompt.ts:9-14` |
| `unknown` | `UnknownSurfaceNode` | `kind, seq, time, type, data` | `records.ts:216-223`；兜底 `conversation-nodes/fallback.ts:8-13` |

**没有单独的 `thinking` / `tool-result` / `error` / `notice` 顶层 kind**——思考是 `assistant-step.data.blocks` 里的 `{kind:'reasoning'}`；工具结果是 `tool-call` 的 `root`（`ToolResultNode`）；错误是 `turn-error`；通知是 `turn-trigger` / `context`。这与 Pi Studio 的扁平 Entry 模型差异最大（见 §8）。

---

## 3. 组件树（外 → 内）

```
ChatView (ui-chat/src/client/chat/ChatView.tsx)
└─ .frame > .root[data-chat-following-tail] > .scroll > .column[data-chat-flow]
   ├─ 历史按钮 .older（Load older）           ChatView.tsx:253-273
   ├─ MarkdownDelegateProvider                  ChatView.tsx:274-280
   ├─ slot 'conversation.chat.flow' → ChatFlow   ChatView.tsx:281-284 / chat/ChatFlow.tsx
   │  └─ entries: 'node' | 'group'              ChatFlow.tsx:52-63
   │     ├─ ChatNodeSeat  ── .flowItem[data-chat-flow-kind=<kind>]   chat/ChatNodeSeat.tsx:152-178
   │     │  └─ slot 'conversation.chat.node' 按 kind 键位分发       chat/register-node-renderers.ts:41-101
   │     │     ├─ user/steering → UserMessageNodeView → UserStyleBubble → UserContent
   │     │     │     └─ UserMessageBubble (ui-primitives) + MessageIconActions
   │     │     ├─ assistant-step → AssistantNodeView → AssistantMarkdown
   │     │     │     ├─ text      → MarkdownText (ui-primitives/markdown/MarkdownText.tsx)
   │     │     │     │               └─ fence → CodeBlock → CodeToolbar / DiffBlock / FenceLayers
   │     │     │     ├─ reasoning → ProcessReasoning > ReasoningRow (DisclosureRow)
   │     │     │     │               └─ slot 'conversation.chat.reasoning.body' → ReasoningContent → MarkdownText(compact)
   │     │     │     ├─ image     → slot 'conversation.chat.message.images'
   │     │     │     └─ tool-call → （跳过，由分组渲染为 tool-call 节点）
   │     │     ├─ tool-call → ToolCallTree (ui-tool) → ToolCallBranch 递归子调用
   │     │     │     └─ slot 'tool.call.toolview'[entryKey=toolName] → GenericToolCard
   │     │     │           └─ ToolRow (DisclosureRow) → terminal: TerminalBlock
   │     │     │                                      → diff: DiffBlock | read: ReadBlock
   │     │     │                                      → search: SearchBlock | web: WebBlock
   │     │     │                                      → code: CodeBlock | 其他: IN/OUT ioCard
   │     │     ├─ context / turn-trigger → ContextInjectionRow / TurnTriggerNodeView
   │     │     ├─ command / manual-compaction → CommandNodeView / CompactionItem
   │     │     ├─ compaction → CompactionItem；inherited-history → 分隔线
   │     │     ├─ model-retry → RetryNodeView (details/summary)
   │     │     ├─ turn-error → TurnErrorItem；turn-max-tokens → TurnMaxTokensItem
   │     │     ├─ turn-process → TurnProcessNodeView（Turn 时长 + 折叠控制）
   │     │     ├─ turn-tail → TurnTailNodeView → MessageIconActions (+TurnUsagePanel)
   │     │     └─ unknown → JsonBlock 兜底                              ChatNodeSeat.tsx:169-175
   │     └─ ChatGroupSeat  ── 分组条（进程组）                    chat/ChatGroupSeat.tsx + .module.css
   ├─ .textInteraction（选区操作浮层）                                ChatView.tsx:286-292
   └─ RunningStatus（"Deep diving" + 鲸鱼动画 + 计时）                chat/ChatFlow.tsx:96-97 / RunningStatus.tsx
```

组件渲染器注册表（键位 = kind）在 `packages/client/ui-chat/src/client/chat/register-node-renderers.ts:41-101`：

| kind | 组件 | 文件 |
|---|---|---|
| `user` / `steering` | `UserMessageNodeView` | `chat/MessageItem.tsx:332-361` |
| `context` | `ContextMessageNodeView` | `chat/MessageItem.tsx:364-375` |
| `turn-trigger` | `TurnTriggerNodeView` | `chat/TurnTriggerNodeView.tsx` |
| `system-prompt` | `SystemPromptNodeView` | `chat/SystemPromptRow.tsx` |
| `assistant-step` | `AssistantNodeView` | `chat/AssistantNodeView.tsx` |
| `command` | `CommandNodeView` / `ManualCompactionNodeView` | `chat/CommandNodeView.tsx` |
| `compaction` | `CompactionNodeView` | `chat/CompactionItem.tsx` |
| `inherited-history` | `InheritedHistoryNodeView` | `chat/MessageItem.tsx:383-394` |
| `model-retry` | `RetryNodeView` | `chat/MessageItem.tsx:397-400` |
| `turn-error` | `TurnErrorNodeView` | `chat/MessageItem.tsx:403-405` |
| `turn-max-tokens` | `TurnMaxTokensNodeView` | `chat/MessageItem.tsx:408-410` |
| `turn-process` | `TurnProcessNodeView` | `chat/TurnProcessNodeView.tsx` |
| `turn-tail` | `TurnTailNodeView` | `chat/TurnTailNodeView.tsx` |
| `unknown` | `UnknownNodeView` | `chat/MessageItem.tsx:413-424` |

---

## 4. 视觉语言

### 4.1 设计令牌定义位置

| 层 | 文件 | 内容 |
|---|---|---|
| 静态原始色 | `packages/client/ui-theme/src/styles/design-platform.css:4-88`（浅）/ `:90-174`（深，`body[data-ds-dark-theme]`） | `--dsw-static-*`（amber/blue/deepseek/green/neutral/neutral-bluish/red/violet），**两套主题的原始色完全相同** |
| 语义别名 | `design-platform.css:176-326`（浅）/ `:328-475`（深） | `--dsw-alias-*`（bg/label/border/state/code/markdown/scrollbar/…），主题只在这一层切换 |
| 字体/圆角/基线 | `packages/client/ui-theme/src/styles/base.css:6-34` | 字体栈、`--dsw-radius-*`、动效 |
| 字体阶梯/阴影/文本尺度 | `packages/client/ui-theme/src/styles/gradient-shadow-text.css:1-45`（渐变/阴影/elevation）、`:47-275`（字号字重阶梯） | `--dsw-font-*`、`--dsh-content-font-*` |
| 语法高亮 | `packages/client/ui-theme/src/styles/shiki.css:7-31` | `--shiki-token-*` 浅/深两套 |
| 滚动条 | `packages/client/ui-theme/src/styles/scrollbar.css:16-26` | `--dsh-scrollbar-*` |
| 焦点环 | `packages/client/ui-theme/src/styles/focus.css:2-21` | `--dsw-focus-ring-width: 2px` |
| 圆角曲线 | `packages/client/ui-theme/src/styles/corner-shape.css:16-26` | `--dsw-corner-shape: superellipse(1.5)`（所有元素 + `::before`/`::after`） |

样式安装顺序：`packages/client/ui-theme/src/client/styles.ts:1-10`（base → corner-shape → design-platform → focus → onboarding → scrollbar → gradient-shadow-text → shiki）。发丝线宽由 DPR 计算：`styles.ts:27-36`（`max(1, floor(0.5*dpr))/dpr`，写 `--dsh-hairline-width`，仅 `ui-primitives/src/Button.module.css:59` 消费）。

### 4.2 关键语义令牌表（浅 / 深）

主机表面（`design-platform.css`）：

| 语义 | 浅色解析值 | 深色解析值 | 行号（浅/深） |
|---|---|---|---|
| `--dsw-alias-bg-base` | `#ffffff`（neutral-bluish-00） | `#151517`（neutral-bluish-950） | 177 / 329 |
| `--dsw-alias-bg-layer-1` | `#ffffff` | `#232324`（875） | 181 / 333 |
| `--dsw-alias-bg-layer-2` | `#ffffff` | `#2c2c2e`（850） | 182 / 334 |
| `--dsw-alias-bg-layer-3` | `#ffffff` | `#353638`（800） | 183 / 335 |
| `--dsw-alias-bg-overlay` | `#e9ecf2`（bluish-150） | `#61666b`（bluish-700） | 191 / 343 |
| `--dsw-alias-label-primary` | `#0f1115`（bluish-1000） | `#f9fafb`（bluish-50） | 259 / 411 |
| `--dsw-alias-label-secondary` | `#61666b`（bluish-700） | `#cfd3d6`（bluish-300） | 260 / 412 |
| `--dsw-alias-label-tertiary` | `#81858c`（bluish-600） | `#adb2b8`（bluish-400） | 262 / 414 |
| `--dsw-alias-label-caption` | `#adb2b8`（bluish-400） | `#81858c`（bluish-600） | 250 / 402 |
| `--dsw-alias-label-dimmed` | `#e1e5ee`（bluish-200） | `#43454a`（bluish-750） | 253 / 405 |
| `--dsw-alias-border-l1` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | 195 / 347 |
| `--dsw-alias-border-l2` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.12)` | 197 / 349 |
| `--dsw-alias-border-l3` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.16)` | 198 / 350 |
| `--dsw-alias-border-l4` | `rgba(0,0,0,.16)` | `rgba(255,255,255,.2)` | 199 / 351 |
| `--dsw-alias-brand-primary` | `#0f1115`（墨色，**不是蓝**） | `#f9fafb` | 203 / 355 |
| `--dsw-alias-link` | `rgb(65,118,230)`（deepseek-500） | `rgb(122,170,255)`（deepseek-400） | 264 / 416 |
| `--dsw-alias-markdown-code-block` | `#f9fafb`（bluish-50） | `#1b1b1c`（bluish-900） | 267 / 419 |
| `--dsw-alias-markdown-code-block-banner` | `#f9fafb`（bluish-50） | `#2c2c2e`（bluish-850） | 266 / 418 |
| `--dsw-alias-markdown-inline-code` | `#fafafa`（neutral-50） | `#292929`（neutral-800） | 270 / 422 |
| `--dsw-alias-markdown-tag` | `#f1f3f5`（bluish-75） | `#2c2c2e`（bluish-850） | 272 / 424 |
| `--dsw-alias-markdown-citation` | `#ebedf2`（bluish-100） | `#353638`（bluish-800） | 265 / 417 |
| **`--dsw-specific-bubble`（用户气泡底）** | `rgb(237,243,254)`（deepseek-50，**淡蓝**） | `#2c2c2e`（bluish-850，中性） | 309 / 461 |
| **`--dsw-specific-bubble-highlight`** | `rgb(211,226,255)`（deepseek-200） | `#43454a`（bluish-750） | 308 / 460 |
| `--dsw-specific-input-major` | `#ffffff` | `#2c2c2e` | 314 / 465 |
| `--dsw-alias-interactive-bg-hover` | `rgba(38,49,72,.06)` | `rgba(255,255,255,.08)` | 242 / 394 |
| `--dsw-alias-interactive-bg-hover-solid` | `#f1f3f5`（bluish-75） | `#353638`（bluish-800） | 241 / 393 |
| `--dsw-alias-interactive-bg-active` | `rgba(38,49,72,.1)` | `rgba(255,255,255,.14)` | 238 / 390 |
| `--dsw-alias-turn-trigger-bg` | `= markdown-code-block` | `= interactive-bg-hover` | 306 / 454 |

状态与代码/diff 色（`design-platform.css`）：

| 语义 | 浅色 | 深色 | 行号（浅/深） |
|---|---|---|---|
| `--dsw-alias-state-success-primary` | `rgb(34,197,94)` | `rgb(34,197,94)` | 291 / 443 |
| `--dsw-alias-state-error-primary` | `rgb(236,19,19)` | `rgb(242,90,90)` | 288 / 440 |
| `--dsw-alias-state-warn-primary` | `rgb(245,158,11)` | `rgb(245,158,11)` | 295 / 447 |
| `--dsw-alias-state-warn-label` | `rgb(221,134,41)` | `rgb(221,134,41)` | 294 / 446 |
| `--dsw-alias-state-idle-primary` | `#d4d4d4`（neutral-300） | `#545557`（neutral-600） | 290 / 442 |
| `--dsw-alias-state-business-primary` | `rgb(65,118,230)`（deepseek-500） | `rgb(122,170,255)`（deepseek-400） | 277 / 429 |
| `--dsw-alias-state-done-primary` | `#7c3aed`（violet-600） | `#a78bfa`（violet-400） | 287 / 439 |
| **`--dsw-alias-code-diff-added`** | `rgb(34 197 94 / 8%)` | `rgb(34 197 94 / 12%)` | 279 / 431 |
| **`--dsw-alias-code-diff-deleted`** | `rgb(236 19 19 / 8%)` | `rgb(242 90 90 / 12%)` | 280 / 432 |
| **`--dsw-alias-file-diff-added-bg`** | `rgb(230,244,231)` | `rgb(31,49,36)` | 281 / 433 |
| `--dsw-alias-file-diff-added-gutter` | `rgb(237,247,237)` | `rgb(19,32,22)` | 282 / 434 |
| `--dsw-alias-file-diff-added-marker` | `rgb(1,162,65)` | `rgb(65,201,119)` | 283 / 435 |
| **`--dsw-alias-file-diff-deleted-bg`** | `rgb(252,230,226)` | `rgb(60,31,27)` | 284 / 436 |
| `--dsw-alias-file-diff-deleted-gutter` | `rgb(253,236,233)` | `rgb(40,19,14)` | 285 / 437 |
| `--dsw-alias-file-diff-deleted-marker` | `rgb(186,39,35)` | `rgb(250,66,62)` | 286 / 438 |
| `--dsw-alias-scrollbar-bg-l1` | `#e5e5e5`（neutral-200） | `#3c3c3d`（neutral-700） | 273 / 425 |
| `--dsw-alias-scrollbar-hover-l1` | `#d4d4d4`（neutral-300） | `#545557`（neutral-600） | 275 / 427 |

思考/运行态专用：

| 语义 | 浅色 | 深色 | 行号（浅/深） |
|---|---|---|---|
| `--dsw-alias-label-deep-diving` | deepseek-500 70% + blue-950 | deepseek-450 55% + bluish-400 | 251 / 403 |
| `--dsw-alias-label-deep-diving-shimmer` | deepseek-500 30% + blue-950 | blue-300 65% + deepseek-400 | 252 / 404 |
| `--dsw-alias-label-shimmer` | 黑 30% | 白 45% | 261 / 413 |
| `--dsw-alias-trajectory-accent` | `rgb(59,130,246)` | `rgb(59,130,246)` | 305 / 459 |

> **注意**：浅色主题 UI 强调色**不是蓝**：`--dsw-alias-brand-primary` 是近黑 `#0f1115`；只有 `--dsw-alias-link` / `--dsw-alias-state-business-primary`（`#4176E6`）与 `--dsw-focus-ring-color`（`#4176E6` 浅 / `#7AAAFF` 深）是蓝（`ui-theme/README.md:70`）。用户气泡是**淡蓝底**，深色反而是中性灰。

### 4.3 字体

`packages/client/ui-theme/src/styles/base.css:6-24`：

```css
:root {
  --dsh-font-family-text-default: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --dsh-font-family-code-default: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas,
    'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
  --dsw-radius-xs: 4px; --dsw-radius-sm: 8px; --dsw-radius-md: 12px;
  --dsw-radius-lg: 16px; --dsw-radius-xl: 20px; --dsw-radius-panel: 28px;
  --ds-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ds-transition-duration: 0.2s; --ds-transition-duration-fast: 0.1s; --ds-transition-duration-slow: 0.3s;
}
```

等宽栈刻意**不带裸 `monospace` 尾巴**（Windows CJK 会 fallback 到宋体，注释见 `base.css:1-5`）。品牌字体 Montserrat（`--dsw-font-family-brand`，`base.css:10`）。

**四轴动态尺度**（关键机制，Pi 目前没有）——由 `gradient-shadow-text.css:56-63` 从 body 上发布的整数 px 派生：

```css
--dsh-content-font-delta: calc(var(--dsh-content-font-size, 14px) - 14px);
--dsh-content-font-size-secondary: min(calc(var(--dsh-content-font-size,14px) - 1px),
                                       max(13px, calc(var(--dsh-content-font-size,14px) - 2px)));
--dsh-content-font-delta-secondary: calc(var(--dsh-content-font-size-secondary) - 13px);
--dsh-code-font-delta: calc(var(--dsh-code-font-size, 11px) - 11px);
```

即：正文 14px 默认（10–22 可调），次级文字 = 正文 −1（≤14 时）或 −2（>14 时），代码块默认 11px（10–16 可调）。行高统一写成 `calc(24px + var(--dsh-content-font-delta, 0px))`——**字号变了行高跟着变**。用户可在 Settings 里独立调文本/代码/终端三档字号（`ui-theme/README.md:34`），由 `packages/client/ui-layout/src/client/theme-presenter.ts:31`（`CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'`）写 body 变量。

字号/字重阶梯（`gradient-shadow-text.css:65-275`，全部是 `font:` 简写 + 拆出的 `-font-size/-line-height/-font-weight`）：

| 角色 | 值 | 行号 |
|---|---|---|
| markdown h1 | 700 21px/30px | 65-70 |
| markdown h2 | 700 19px/28px | 72-77 |
| markdown h3 | 700 18px/26px | 79-84 |
| markdown h4 | 600 14px/24px | 86-91 |
| markdown base | 400 14px/24px | 93-98 |
| markdown base-strong | 600 14px/24px | 100-105 |
| markdown base-italic | italic 400 14px/24px | 107-112 |
| markdown table | 400 13px/22px | 121-126 |
| markdown table-head | 500 13px/22px | 128-133 |
| markdown small / strong / italic | 12px/20px（strong 600，italic 斜体） | 135-161 |
| markdown code（行内） | 12px(+delta)/19px(+delta) 等宽 | 163-168 |
| markdown code-block | 11px(+delta)/19px(+delta) 等宽 | 170-175 |
| markdown code-block-small | 11px/16px 等宽（工具卡内小号） | 178-183 |
| xl-24 | 600 24px/32px | 185-190 |
| l-20 | 500 20px/28px | 192-197 |
| m-18 | 500 16px/28px | 199-204 |
| base-16 | 400 16px/24px | 206-211 |
| s-14 | 400 14px/22px | 220-225 |
| xs-13 | 400 13px/20px | 234-239 |
| xxs-12 | 400 12px/18px | 248-253 |
| xxxs-11 | 400 11px/14px | 262-267 |

字重：markdown 用 400/500/600/700，**UI 组件普遍只用 400 与 500**（`dsh-client-ui-ux` skill 明令 feature CSS 字重 ≤500，见 `.agents/skills/dsh-client-ui-ux/SKILL.md:65`）。

### 4.4 用户消息 vs 助手消息排布

**用户消息**（右对齐气泡，无头像）：

`packages/client/ui-chat/src/client/chat/MessageItem.module.css:3-21`：

```css
.userRow   { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.userStack { display:flex; flex-direction:column; align-items:flex-end; gap:8px; min-width:0;
             max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%); }
```

`packages/client/ui-primitives/src/UserMessageBubble.module.css:1-11`：

```css
.bubble {
  max-width: 100%;
  background: var(--dsw-specific-bubble);        /* 浅色 淡蓝 deepseek-50 / 深色 bluish-850 */
  border-radius: var(--dsw-radius-xl);           /* 20px */
  padding: 10px 16px;
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
```

- 宽度上限是**内容列宽 ×0.702**（Figma 原始 525/748），再夹到 82%；注释明确这是"随可拖拽列宽一起变"的设计（`MessageItem.module.css:16-20`）。
- 附件行右对齐 `justify-content:flex-end`（`:355-361`）；文件卡 240×64、`border:0.5px solid border-l2`、`border-radius: var(--dsw-radius-lg)`(16px)、`background: var(--dsw-specific-input-major)`（`:363-375`）。
- 引用摘要行用 secondary 字号 tertiary 色（`:22-26`）。

**助手消息**（全宽左对齐，无气泡无头像）：

`packages/client/ui-chat/src/client/chat/AssistantMarkdown.module.css:9-22`：

```css
.root { display:flex; flex-direction:column;
        font-size: var(--dsh-content-font-size, 14px);
        line-height: calc(24px + var(--dsh-content-font-delta, 0px));
        color: var(--dsw-alias-label-primary); }
.body { --dsh-assistant-block-gap: 16px; display:flex; flex-direction:column; gap: var(--dsh-assistant-block-gap); }
```

- 块间距 16px；**reasoning 分组里改成 4px**（`:27-29`）。
- 消息列（measure）：`ChatView.module.css:69-76` `.column { max-width: var(--dsh-chat-content-width); width:100%; margin:0 auto; }`。
- 列宽定义在 `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css:468-471`：
  `--dsh-chat-content-width: var(--dsh-chat-user-width, clamp(680px, calc(var(--dsh-conversation-column-width,0px) * 0.64), 920px))`
  ——默认夹在 **680–920px**，可由用户拖拽（宽度手柄 `:344-365`，10px 命中条，离内容列 24px）。
- 滚动区 padding：`ChatView.module.css:32` `padding: 16px calc(var(--dsh-composer-side-clearance) + 16px)`。
- 助手页脚动作行：`AssistantMarkdown.module.css:84-88` `margin-top:16px; margin-left:-6px`。

### 4.5 思考块（reasoning / thinking）

组件：`packages/client/ui-chat/src/client/chat/ReasoningRow.tsx`（用共享 `DisclosureRow`）。

- 默认**折叠**；折叠态是单行 24px，展开用 `useDisclosure` 独立状态（`ReasoningRow.tsx:59, 86-93`）。
- 折叠摘要：跑动中取"最后一个已完成段落的首行"，静止取首行；预览时去掉 `**`（`ReasoningRow.tsx:17-33, 64-67`）。
- 图标：`IconThinkOutlineRegular`（`ReasoningRow.tsx:10`）；标题文案 `t('message.think')`。

`packages/client/ui-chat/src/client/chat/ReasoningRow.module.css`：

```css
.root:not([data-expanded]) { contain: size layout; height: calc(24px + var(--dsh-content-font-delta, 0px)); }  /* :6-9 */
.summary     { font-size: var(--dsh-content-font-size-secondary, 13px);
               line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
               white-space: nowrap; }                                     /* :44-51 */
.summary[data-streaming] { mask-image: linear-gradient(to right, black calc(100% - 48px), transparent); } /* :59-61 */
.thinkBody   { padding: 4px 0 4px calc(22px + var(--dsh-content-font-delta, 0px)); }                       /* :73-76 */
```

- **没有斜体、没有左边框侧线。** 展开正文的视觉由 `DefaultReasoningBody → MarkdownText variant="compact"` 决定：`MarkdownText.module.css:351-356` 给 `.compact` 设 `font-size: var(--dsh-content-font-size-secondary, 13px)`、`line-height: calc(20px + …)`、`color: var(--dsw-alias-label-tertiary)`，并整体"继承"（链接同色带虚线、代码不着色，`:390-433`）。即**思考正文 = tertiary 灰 + 13/20**。
- 折叠行行色 tertiary，hover 变 secondary（`DisclosureRow.module.css:38, 46-50`）。

### 4.6 工具调用卡（tool call / tool result）

组件链：`ToolCallTree.tsx`（递归子调用）→ `GenericToolCard.tsx` → `ToolRow.tsx`（共享 `DisclosureRow` 头部）。

**头部栏构成**（`ToolRow.module.css:1-7` 的设计注 + `DisclosureRow.module.css:30-74`）：

`[16px leading 图标盒] gap 6 [title 13/24] gap 8 [2×2 圆点 separator] gap 8 [summary 撑满并截断] [+suffix] [+diff totals]`

- leading 盒 16px、内部 svg 14px，两者都随字号 delta 缩放（`DisclosureRow.module.css:52-74`）。
- separator 是一个 **2×2px、`border-radius:1px`、`background: var(--dsw-alias-label-caption)` 的小圆点**（`ToolRow.module.css:26-33`；ReasoningRow/ContextInjectionRow 同款）。
- title `font-weight:400`；`cordis_*` 前缀工具用 500（`ToolRow.module.css:18-24`）。
- summary：secondary 字号、`white-space:nowrap`、`text-overflow:ellipsis`（`:35-43`）。
- 状态色：`errorSummary → var(--dsw-alias-state-error-primary)`（`:166-168`）；`stoppedSummary → var(--dsw-alias-state-warn-label)`（`:171-173`）。**没有常驻彩色状态徽标**：运行/成功默认是 tertiary；diff 的 +N/−N 只**在 hover 或展开时**上色（`:71-89`）。
- 耗时：**行内不显示耗时**。Turn 级耗时由 `turn-process` 行呈现（见 §4.8）；工具行时长只在 Trajectory 视图。

**状态判别联合**（`packages/client/ui-tool/src/client/tool/models/tool-call-model.ts:20`）：

```ts
export type ToolRowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'
```

推导（`:404-406`）：`!done ? (phase==='preparing' ? 'preparing' : 'running') : (error?.code==='interrupted' ? 'stopped' : (isError || meta.stopped ? 'error' : 'ok'))`。无障碍文本 `stateStatus()` 在 `ToolRow.tsx:150-158`。

**折叠交互**：`DisclosureRow`（`packages/client/ui-primitives/src/DisclosureRow.tsx:74-121`）——折叠时 leading 显示业务图标，hover/focus 时图标淡出、`IconChevronDownOutlineRegular` 淡入（同一个 16px 盒，100ms 交叉淡入，`DisclosureRow.module.css:80-102`）；展开后 leading 换成 chevron-up（`DisclosureRow.tsx:82-84`）。整行可点（`expandOnRowClick`），Enter/Space 也切（`DisclosureRow.tsx:69-73`）。状态**受控**（`open` 由 `useDisclosure` 提供）。

**展开输出区**（`ToolRow.module.css:238-376`）：

| 变体 | 组件 | 关键样式 |
|---|---|---|
| 终端（bash） | `TerminalBlock` | `--dsl-terminal-font: --dsw-font-markdown-code-block-small`、`--dsl-terminal-line-height:18px`、`--dsl-terminal-output-max-height:224px`、`border:0.5px solid var(--dsw-alias-border-l1)`、`margin:4px 0 4px 4px`（`:370-376`） |
| diff | `DiffBlock` | `margin:4px 0 4px 4px`，`maxLines: CHAT_DIFF_MAX_LINES`（`ToolRow.tsx:348`） |
| 读文件 | `ReadBlock` | `CHAT_READ_MAX_LINES`（`ToolRow.tsx:360`） |
| 搜索 | `SearchBlock` | `CHAT_SEARCH_MAX_LINES` + `searchRecovery` 提示行（`ToolRow.tsx:395-405`） |
| 网页 | `WebBlock` | `ToolRow.tsx:409` |
| code / 其他 | `CodeBlock` 或 **IN/OUT 卡** | `.ioCard`：`border:0.5px solid border-l1`、`border-radius: var(--dsw-radius-lg)`(16px)、`background: markdown-code-block`、`font: markdown-code-block-small`、`margin:4px 0 4px 4px`（`:247-255`） |
| 普通 code body | `.bodyScroll` | `max-height: 260px; overflow-y:auto`（`:238-241`） |
| IN/OUT 分区 | `.ioSection` | `grid-template-columns: max-content 1fr`、`column-gap:14px`、`padding:12px 16px`、`max-height:150px`、各自独立滚动（`:259-267`） |
| IN/OUT 标签 | `.ioLabel` | sticky top 0，`color: var(--dsw-alias-label-caption)`（`:288-293`） |
| IN/OUT 分隔 | `.ioDivider` | `height:0.5px; background: var(--dsw-alias-border-l2)`（`:297-301`） |
| IN/OUT 文本 | `.ioText` | pre-wrap，`color: label-secondary`；错误时 `[data-error] → state-error-primary`（`:303-313`） |

**Inspect 药丸**（hover 才显形，跳 Trajectory）：`border:0.5px solid border-l3`、`border-radius:999px` + `corner-shape:round`、`background: bg-base`、`11px/16px`、`opacity:0 → hover/focus 1`（`:185-233`）；`@media (hover:none)` 常显（`:390-392`）。

**退出码徽标** `ExitCodeBadge.module.css:1-14`：4px 圆点 + `state-error-primary`，`margin-left:8px`。

**子调用**：`ToolCallTree.tsx:84-101` 把 `subCalls` 递归渲染进 `.subCalls` 容器（`ToolCallTree.module.css`）。

### 4.7 代码块与命令/终端输出

**Markdown 代码块**（`packages/client/ui-primitives/src/markdown/CodeBlock.module.css`）：

```css
.block { --dsl-code-block-border-radius: var(--dsw-radius-lg);            /* 16px */
         --dsl-code-block-banner-font: 11px/18px var(--dsw-font-family);
         --dsl-code-block-content-font: var(--dsw-font-markdown-code-block);
         --dsl-code-block-background: var(--dsw-alias-markdown-code-block);
         margin: 16px 0; border-radius: …; background: …; }               /* :4-18 */
.bannerWrap { position: sticky; top: 0; z-index: 6;                        /* :24-31 */
              background-color: var(--dsw-alias-bg-base); }               /* 遮挡滚动内容 */
.banner  { background: var(--dsw-alias-markdown-code-block-banner);
           padding: 9px 14px; display:flex; justify-content:space-between; gap:12px; }  /* :33-43 */
.block :where(pre) { font: var(--dsl-code-block-content-font); padding: 16px;
                     overflow-x:auto; white-space: pre-wrap; word-break: break-all; }   /* :78-90 */
```

- 顶部栏 = 语言标签（`.infostring`，等宽 11px）+ 复制按钮（+可选换行/不换行按钮），见 `CodeToolbar.tsx:38-61`：`<div className={css.header} data-code-block-banner>`，依次是语言标签、标题、状态、wrap 按钮、copy 按钮。
- 复制按钮状态由 `useClipboardCopy` 管理：成功后 **1000ms** 内显示对勾（`packages/client/ui-primitives/src/use-clipboard-copy.ts:18-43`）。
- **无行号**（行号只在 `numbered` 变体：`CodeBlock.module.css:122-145`，用 CSS counter 画在左侧，颜色 `label-tertiary`）。
- banner 是 sticky 的（z-index 6），compaction 头部（z-index 7）会压住它（`MessageItem.module.css:104-130`）。
- 最大高度：`CodeBlock` 本体不设；工具行的 code 变体由 `.bodyScroll` 给 260px（`ToolRow.module.css:238-241`），compaction 摘要体给 141px（`ContextInjectionRow.module.css:50-64`）。

**终端 / 命令输出**（`packages/client/ui-primitives/src/TerminalBlock.module.css`）：

```css
.block  { --dsl-terminal-radius: var(--dsw-radius-lg);   /* 16px */
          --dsl-terminal-line-height: 22px;
          --dsl-terminal-font: var(--dsw-font-markdown-code-block);
          --dsl-terminal-gutter: 30px;
          margin: 16px 0; padding-left: var(--dsl-terminal-gutter);
          background: var(--dsw-alias-markdown-code-block); overflow: hidden; }  /* :1-27 */
.header { display:flex; gap:12px; padding: 9px 14px; max-height:150px; overflow-y:auto; }  /* :32-48 */
.block[data-body] .header { border-bottom: 0.5px solid var(--dsw-alias-border-l2); }        /* :64-66 */
.command { color: var(--dsw-alias-label-primary); }                                        /* :115-118 */
.status  { color: var(--dsw-alias-state-error-primary); height: var(--dsl-terminal-line-height); } /* :124-130 */
.output  { max-height: var(--dsl-terminal-output-max-height, none);
           padding: 12px 14px 12px 0; overflow:auto; }                                     /* :152-158 */
.line    { min-height: var(--dsl-terminal-line-height);
           white-space: var(--dsl-terminal-line-whitespace, pre); }                        /* :179-183 */
```

- 左侧 30px **gutter** 内放 8px 的 run-state 圆点（`:91-96`；`StateDot`：运行=呼吸弧 spinner、成功=绿点、失败=红点、警告=黄点、idle=灰点，见 `StateDot.module.css:17-83`）。
- 输出**默认不换行**（`pre`），宿主可重绑成 `pre-wrap`；典型工具行用 `--dsl-terminal-output-max-height: 224px`（=260px 卡高 − 约 36px banner）。
- 滚动条：thumb 加 2px 透明 border 内缩 + `background-clip: padding-box`，track `margin: 6px`（`:50-59, 163-173`）。

**diff 围栏（markdown 里的 diff 代码块）**：`CodeBlock.module.css:149-208`

```css
.diffAdd { background: var(--dsw-alias-file-diff-added-bg);
           box-shadow: inset 3px 0 0 var(--dsw-alias-file-diff-added-marker); }
.diffDel { background: var(--dsw-alias-file-diff-deleted-bg);
           box-shadow: inset 3px 0 0 var(--dsw-alias-file-diff-deleted-marker); }
.diffContext { color: var(--dsw-alias-label-secondary); }
.diffHunk    { color: var(--dsw-alias-label-secondary); }
.diffMeta    { color: var(--dsw-alias-label-tertiary); }
.diffLine    { padding: 0 16px; }        /* 在 .diffFence 下 */
```

**独立 DiffBlock**（`packages/client/ui-primitives/src/DiffBlock.module.css`）：

```css
.body { display:grid; grid-template-columns: minmax(max-content,1fr);
        padding: 6px 0 20px; font: var(--dsw-font-markdown-code-block); overflow-x:auto; }  /* :5-11 */
.line { min-height: 1lh; padding: 0 22px; white-space: pre; }                              /* :13-18 */
.del  { color: var(--dsw-alias-state-error-primary);
        background: var(--dsw-alias-code-diff-deleted);
        box-shadow: inset 3px 0 0 var(--dsw-alias-state-error-primary); }
.del::before { content: '- '; }
.add  { color: var(--dsw-alias-state-success-primary);
        background: var(--dsw-alias-code-diff-added);
        box-shadow: inset 3px 0 0 var(--dsw-alias-state-success-primary); }
.add::before { content: '+ '; }
.context { color: var(--dsw-alias-label-secondary); } .context::before { content: '  '; }
.gap  { color: var(--dsw-alias-label-tertiary); }   /* 折叠区间隙行 */
.path { color: var(--dsw-alias-label-secondary); font-weight: 500; }
.expand { padding: 0 22px; color: var(--dsw-alias-label-tertiary); }  /* 展开隐藏上下文 */
```

- **行号列**：DiffBlock 本体**不画行号**，只有 `-` / `+` / 空格 三个字符的前缀列（`::before` 的 content）。`diff-fence.ts:19-46` 把统一 diff 文本切成 `kind: 'add'|'del'|'context'|'hunk'|'meta'` 的行 + `marker` 列；hunk 头正则 `diff-fence.ts:49`，文件级 chrome 前缀清单 `diff-fence.ts:42-46`。
- **hunk 头部**：`kind:'hunk'` 走 `.diffHunk`（secondary 色）；文件级 chrome（`diff --git`、`index`、`old mode`…）走 `.diffMeta`（tertiary 色）。

### 4.8 间距节奏

| 位置 | 值 | 证据 |
|---|---|---|
| 流内相邻行（默认） | **4px** | `ChatView.module.css:86` `--dsh-chat-flow-gap, 4px` |
| Reasoning 组内部 | **4px** | `AssistantMarkdown.module.css:27-29`；`ChatGroupSeat.module.css:103` |
| 助手正文块之间 | **16px** | `AssistantMarkdown.module.css:18` |
| 助手回答与相邻进程行 | **12px** | `ChatView.module.css:91-98` |
| Turn 的 process 控制与其后 | **16px** | `ChatView.module.css:140-144` |
| Turn tail / steering 起始槽 | **44px + font delta** | `ChatView.module.css:155-157` |
| 运行状态行 | 内容高 28px + `margin-top:4px` | `ChatView.module.css:267-274` |
| 工具卡展开体缩进 | `margin: 4px 0 4px 4px` | `ToolRow.module.css:330-331` |
| 思考块展开体 | `padding: 4px 0 4px calc(22px + delta)`（与标题 16+6 对齐） | `ReasoningRow.module.css:73-76` |
| IN/OUT 分区 | `padding:12px 16px`，`column-gap:14px` | `ToolRow.module.css:259-267` |
| markdown 段落 / 列表 | `p{margin:16px 0}`；`ul,ol{margin:16px 0; padding-left:18px}`；`li:not(:first-child){margin-top:6px}` | `MarkdownText.module.css:45-47, 109-116` |
| markdown 标题 | h1–h3 `margin: 32px 0 16px`；h4–h6 `margin:16px 0` | `MarkdownText.module.css:16-39` |
| markdown `hr` | `height:0.5px; margin:32px 0; background:border-l2` | `MarkdownText.module.css:150-156` |
| 代码围栏块间距 | `margin:16px 0`，非末位时 `margin-bottom:11px` | `CodeBlock.module.css:14, 20-22` |
| 进程组展开体 | `max-height: min(400px, 50vh)`，上/下 24px 渐隐 mask | `ChatGroupSeat.module.css:102-133` |

**分隔线用法**（全部 0.5px hairline）：
- 继承历史分隔：`border-top: 0.5px solid border-l2`，两侧线 + 居中说明（`MessageItem.module.css:41-45, 383-394`）。
- 运行状态分隔：`height:0.5px`，颜色 `color-mix(in srgb, border-l1 75%, border-l2)`（`ChatView.module.css:249-258`）。
- Turn process 头：`border-bottom: 0.5px solid border-l2`（`TurnProcessNodeView.module.css:10`）。
- IN/OUT 卡与终端 banner：0.5px `border-l2`。

### 4.9 圆角与阴影 / hairline

**圆角阶梯**（`base.css:18-23`；权威说明 `docs/ui-radius.md:30-43`）：

| token | 值 | 用途（`ui-radius.md:30-43`） |
|---|---|---|
| `--dsw-radius-xs` | 4px | H<20 小件、keycap、行内 code |
| `--dsw-radius-sm` | 8px | H20–28 紧凑控件、菜单项、action 按钮 |
| `--dsw-radius-md` | 12px | H32–40 标准控件 |
| `--dsw-radius-lg` | 16px | 大按钮/多行单元、**代码块 / diff / 预览卡** |
| `--dsw-radius-xl` | 20px | 独立内容卡、**消息气泡**、Turn trigger |
| `--dsw-radius-panel` | 28px | 主包围面（composer、对话框、浮动面板） |

- 曲线：全区 `corner-shape: superellipse(1.5)`（`corner-shape.css:16-26`）；满圆（`50%`、`999px`）必须配 `corner-shape: round`。
- transcript 内实际用到的：用户气泡 `radius-xl`(20)；工具卡展开体/代码块/终端/IN-OUT 卡 `radius-lg`(16)；action 按钮与滚动条 thumb `radius-sm`(8)；行内 code `radius-sm`(8)；Context body `radius-md`(12)；Inspect 药丸 `999px`+round。

**阴影**（`gradient-shadow-text.css:4-40`）：

```css
--dsw-shadow-lv1:   0 2px 4px 0 rgba(0,0,0,.05);
--dsw-shadow-lv1-blur: 0 4px 12px 0 rgba(0,0,0,.02);
--dsw-shadow-lv2:   0 4px 12px 0 rgba(0,0,0,.02), 0 2px 8px 0 rgba(0,0,0,.04);
--dsw-shadow-lv3:   0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08);
--dsw-elevation-stroke: 0 0 0 0.5px var(--dsw-elevation-stroke-color);   /* 发丝描边画进 box-shadow，不占布局 */
--dsw-elevation-panel:     stroke + 0 3px 8px rgba(0,0,0,.03)  + 0 0 16px rgba(0,0,0,.02);
--dsw-elevation-prominent: stroke + 0 3px 8px rgba(0,0,0,.04)  + 0 0 20px rgba(0,0,0,.05);
--dsw-elevation-soft:      stroke + 0 4px 16px rgba(0,0,0,.03) + 0 0 24px rgba(0,0,0,.03);
--dsw-elevation-stroke-color: var(--dsw-alias-border-l4);  /* 深色菜单面重绑 border-l3 */
```

规则（`docs/web-styling.md:26,32`）：**抬升面用 `border: 0` + `box-shadow: var(--dsw-elevation-*)`，绝不与 `--dsw-alias-border-*` 边框同时出现**；平面分隔/卡片描边一律 **0.5px** hairline（`ui-primitives/src/Button.module.css:59` 是唯一用 DPR 变量 `--dsh-hairline-width` 的地方，其余硬写 `0.5px`）。transcript 内的代码块/工具卡/终端卡/IN-OUT 卡都是**平面卡片**（0.5px 边 + 无阴影），只有浮起的"回到底部"按钮用 elevation：`ChatView.module.css:388-405` `34×34`、`border-radius:100px`+`corner-shape:round`、`box-shadow: var(--dsw-elevation-panel)`、`--dsw-elevation-stroke-color: border-l3`。

---

## 5. 交互与状态

| 交互 | 实现 | 证据 |
|---|---|---|
| 折叠/展开 | 共享 `DisclosureRow`，受控 `open`；整行可点 + Enter/Space；leading 图标 hover 交叉淡入 chevron；`aria-expanded`/`role=button` | `ui-primitives/src/DisclosureRow.tsx:64-121`；`DisclosureRow.module.css:80-102` |
| 独立展开状态 | `useDisclosure`（`ui-chat/src/client/chat/use-disclosure.ts`），Turn 隐藏成员时通过 `disclosureReset` 计数器重置 | `ChatNodeSeat.tsx:122-131` |
| 复制 | `useClipboardCopy`：写剪贴板成功后本地 `copied=true` **1000ms**；带 `aria-label` 与 Tooltip | `ui-primitives/src/use-clipboard-copy.ts:18-43`；`MessageIconActions.tsx:60-64` |
| 分支/重试（重放） | 消息动作行 `MessageIconActions`：copy / branch / 可选 usage；用户行 clock 在前，助手行 clock 在后 | `ui-chat/src/client/chat/MessageIconActions.tsx:45-89`；`TurnTailNodeView.tsx:64-78` |
| 模型重试链 | `<details>/<summary>` 原生折叠，带倒计时（scheduled 态每 250ms 刷新，Shimmer 文案） | `MessageItem.tsx:63-128` |
| 流式光标 / typing | **没有插入符**。流式态用 (a) `TextShimmer` 扫光、(b) reasoning 摘要右侧 48px 渐隐 mask、(c) 底部"Deep diving"运行态（蓝色 `--dsw-alias-label-deep-diving` + 鲸鱼 mask 动画 + 秒级计时） | `TextShimmer.module.css:34-77`（1.5s steps(48)，delay .3s）；`ReasoningRow.module.css:59-61`；`RunningStatus.tsx:25-47`；`ChatView.module.css:218-317` |
| 错误态 | Turn 错误：`StateDot state="error"` + 标题（`state-error-primary` + 600）+ 消息（secondary）+ 错误码 `<code>`（tertiary，小号 code 字体）；工具行：summary 首行转红 | `MessageItem.tsx:132-146`；`MessageItem.module.css:315-347`；`ToolRow.module.css:166-168` |
| 空态 | 无 Session 时整页 Hero（34px 鱼 + 标题 26/32 wt500 + "Preview" 徽标），composer 挂载在外部 | `ui-conversation/src/client/skeleton/EmptyHero.tsx:132-166`；`HeroShell.module.css:5-45` |
| 滚动到底部 | 未跟随尾部时显示右下 34px 圆钮（`.toBottom`），跟随态隐藏；`.toBottomSlot` z-index 8，位于 composer 之上、其菜单之下 | `ChatView.tsx:301-312`；`ChatView.module.css:357-411` |
| 跟随尾部 | `data-chat-following-tail` 挂在 `.root`；跟随时关闭 `overflow-anchor`；离开底部即改遵循策略 | `ChatView.tsx:242`；`ChatView.module.css:45-48`；`use-scroll-follow.ts` |
| 加载更早 | `.older` 居中按钮，5 个态（more/loading/processing/error/start）互相覆盖显示 | `ChatView.tsx:253-273`；`ChatView.module.css:325-355` |
| 动作行渐显 | 较早的用户行与选择 hover 揭示的尾部：`opacity:0 → 1`（80ms），`@media (hover:none)` 常显 | `MessageIconActions.module.css:42-61` |
| 渐隐边缘 | 进程组内容 overflow 时上下 24px mask 渐隐 | `ChatGroupSeat.module.css:117-133` |
| 滚动条 | 5px 宽；thumb 用 `--dsw-alias-scrollbar-bg-l1`；卡内滚动条 thumb 内缩 2px 避免压圆角 | `scrollbar.css:16-26`；`ToolRow.module.css:269-281` |
| 面板动画 | Turn 折叠/间距变化 160ms `cubic-bezier(0.4,0,0.2,1)`，`prefers-reduced-motion` 下全部关闭 | `ChatView.module.css:112-135`；`DisclosureRow.module.css:111-115` |

---

## 6. 图标系统

- **一套自绘 outline 图标**，全部内联在 `packages/client/ui-primitives/src/icons/artwork.ts`（78KB）、`icons/shared-artwork.tsx`、`src/code-file-icon-artwork.ts`（57KB，语言文件图标）与 `src/icons/index.tsx`（31KB 导出）。
- 渲染路径：`installIconSprite` 在 `body` 开头插一个隐藏的 `<svg data-dsh-icon-sprite>`，把 `ICON_SYMBOLS` 的每个 id 建成 `<symbol>`，组件用 `<use>` 引用；**第三方主题可整套替换图标**（`ThemeDefinition.icons`，替换件必须是带 `viewBox` 的 SVG 根，且 `<symbol id>` 前缀校验）——证据 `packages/client/ui-theme/src/client/icon-sprite.ts:1-57`；`ui-theme/README.md:44`。
- 尺寸：Flow 行统一 **16px 盒 / 14px 字形**，两者随字号 delta 缩放（`DisclosureRow.module.css:52-74`）；动作按钮字形 15px（助手端 17px）`MessageIconActions.module.css:79-87`；`StateDot` 例外，保持固定尺寸（`DisclosureRow.module.css:67-74`）。

**工具图标映射**（三层）：

1. 通用变体 → 图标（`ui-tool/src/client/tool/toolviews/GenericToolCard.tsx:17-26`）：
   ```tsx
   const VARIANT_ICONS: Record<ToolRowVariant, ReactNode> = {
     search: <IconSearchOutlineRegular size={14} />,
     read:   <IconBrowseOutlineRegular size={14} />,
     bash:   <IconApiOutlineRegular size={14} />,
     write:  <IconEditOutlineRegular size={14} />,
     edit:   <IconEditOutlineRegular size={14} />,
     code:   <IconCodeOutlineRegular size={14} />,
     others: <IconSparkleRegular size={14} />,
   }
   ```
2. 具体工具名 → 图标（`ui-tool/src/client/tool/toolviews/details-row.tsx:30-38`）：
   ```tsx
   if (AGENT_TOOLS.has(toolName))                    return <IconUsersOutlineRegular size={14} />
   if (toolName.startsWith('schedule_'))             return <IconClockOutlineRegular size={14} />
   if (toolName.endsWith('_goal'))                   return <IconGoalOutlineRegular size={14} />
   if (toolName.startsWith('cordis_'))               return <IconCordisPluginOutlineRegular />
   if (toolName.startsWith('terminal_'))             return <IconCodeOutlineRegular size={14} />
   if (toolName.startsWith('session_') || 'lsp')     return <IconSearchOutlineRegular size={14} />
   if (toolName.startsWith('job_') || 'team_task_')  return <IconChecklistOutlineRegular />
   if (toolName === 'workflow' || 'ralph')           return <IconBranchOutlineRegular size={14} />
   return <IconAgentPresetOutlineRegular size={14} />
   ```
3. 行内固定图标：question → `IconQuestionOutlineRegular`、todo → `IconChecklistOutlineRegular`、web/office/read → `IconBrowseOutlineRegular`（`web_fetch` 用 `IconGlobeOutlineRegular`）、think → `IconThinkOutlineRegular`（`ReasoningRow.tsx:10`）、context → `IconContextInjectionOutlineRegular`（`ContextInjectionRow.tsx:51-55`）、分支/继承 → `IconBranchOutlineRegular`、inspect → `IconInspectOutlineRegular`、chevron → `IconChevronUp/DownOutlineRegular`。
- 另有以**文件名后缀**驱动的语言文件图标：`ui-primitives/src/code-file-icon-artwork.ts` + `src/code-file-types.ts` + `src/FileTypeIcon.tsx`。

---

## 7. 可单独引用的设计令牌 / 样式指南文档

**有，而且很完整**（这些是重绘前最该先读的）：

| 文档 | 路径 | 内容 |
|---|---|---|
| Web UI 样式参考（**权威样式规则**） | `docs/web-styling.md`（57 行） | ownership、组件规则（token 用法、0.5px hairline、hover media query、elevation 与 border 互斥、菜单材质）、输入能力查询、圆角入口、评审基线 |
| 统一圆角标准 | `docs/ui-radius.md`（119 行） | 角色→半径表（R4/R8/R12/R16/R20/R28）、嵌套几何、设置卡材质、验证流程 |
| ui-theme 包参考 | `packages/client/ui-theme/README.md` | 令牌全清单解读、字体/字号设置语义、图标 sprite、elevation 机制、滚动条重绑、持久化 |
| 设计评审用例 | `docs/ui-design-review-cases.md` | 密度/几何/整页评审用例 |
| 设计/评审 skill | `.agents/skills/dsh-client-ui-ux/SKILL.md` + `references/{alignment,spacing,icons}.md` | 视觉基础、几何、对齐、间距、图标规则；含"feature CSS 字重 ≤500"等硬规则 |
| 会话装配模型 | `docs/subsystems/conversation.md` | 事件→节点数据模型、Definition/Context/Location/Group 协议 |
| ui-chat 包参考 | `packages/client/ui-chat/README.md`（221 行） | 渲染分组、Turn 折叠、滚动归属、Markdown 围栏层、图标动作、隐藏行 |
| 会话节点业务规则 | `packages/client/ui-chat/src/client/conversation-nodes/README.md`（38KB） | display modes、折叠时机、进程分组、Turn 组装 |
| ui-tool 包参考 | `packages/client/ui-tool/README.md` | 工具卡模型与 toolview 注册 |

**没有 Storybook**（全仓库搜 `*stories*` 为空）。取而代之：
- 各包的 `tests/*.spec.ts` 里有大量**样式断言**（例如 `ui-chat/tests/chat-font-axis-styles.client.spec.ts`、`ui-theme/tests/radius-styles.client.spec.ts`、`ui-theme/tests/color-tokens.client.spec.ts`、`ui-theme/tests/elevation-styles.client.spec.ts`），等于把令牌契约钉在测试里。
- `apps/web` 的 `?preview` 入口（`apps/web/src/preview.ts`）是 Web Worker 预览引导，**不是样式 gallery**。
- `.agents/notes/{implemented,proposed,archived,rejected}/` 是决策/变更历史；`archived/**` 是历史归档（本次按任务提示未深入）。

---

## 8. 与 Pi Studio 语义对接的注意点（重绘时的坑）

Pi 现状（`D:\workspace\mycode\agent-design`）：`docs/adr/0004` 三级渲染、`0006` Turn/Tool Group 三层折叠、`0001` 三层令牌（`packages/app/src/styles/tokens.primitives.css` + `tokens.semantic.css`）。`GLOSSARY.md` 已定义 Turn / Tool Group / Entry / Active Branch / TranscriptModel。

1. **模型粒度不同（最大差异）**
   DSH 的 `ChatNodeDataMap` 里**没有 `thinking` / `tool-result` / `error` 顶层 kind**：思考是 `assistant-step.blocks[].kind==='reasoning'`，工具结果挂在 `tool-call.root`（`ToolResultNode`），错误是 `turn-error`。Pi 的 Entry 是扁平的（`packages/shared/src/pi-types.ts:9-113`：`TextBlock/ThinkingBlock/ToolCallBlock` + `AssistantMessage/ToolResultMessage/BashExecutionMessage`）。重绘时**建议保留 Pi 的 Entry → TranscriptModel → 视图条目三层**，只在视图条目层对齐 DSH 的 kind 命名，不要把 DSH 的 declaration merging 机制搬进来。

2. **Pi 缺的机制，最值得抄的两个**
   - **四轴动态字号**（§4.3）：`--dsh-content-font-size` + `-delta` + `-secondary` + `--dsh-code-font-size`/`-delta`。Pi 的令牌目前只有静态字号（`--text-*`/`--leading-*`）。若要支持字号偏好，可在语义层加一组 `--content-font-size` + `--content-font-delta`，行高一律写成 `calc(<基准>px + var(--content-font-delta))`。**注意 Pi 组件里行高是常量 token，全量替换动作不小**，可先只在 transcript 内落地。
   - **`--dsh-chat-content-width` 作为唯一列宽轴**（`ConversationRoot.module.css:468-471`）：`clamp(680px, 列宽*0.64, 920px)`，用户气泡取它的 `*0.702`。Pi 的 `--content-measure: 760px`（`tokens.semantic.css:99`）是单一常数；若要支持宽屏/可拖拽，用 DSH 这个"一个轴变量 + 消费方乘系数"的写法最省。

3. **视觉方向冲突，必须二选一后再抄**
   - **用户气泡**：DSH 浅色气泡底是**淡蓝** `rgb(237,243,254)`；Pi 的 `--bubble-user-bg` 是暖中性 `#e8e6dc`（ADR-0005 Claude 式）。**不要照抄 `--dsw-specific-bubble`**，沿用 Pi 自己的语义值，只抄几何：「右对齐 + `max-width: min(列宽*0.702, 82%)` + `padding:10px 16px` + `border-radius:20px` + `white-space:pre-wrap` + `word-break:break-word`」。
   - **圆角阶梯**：DSH 是 4/8/12/16/20/28；Pi 是 4/6/8/10/12/14(气泡)/999（`tokens.primitives.css:71-78`）。**不要直接抄 DSH 的 px 值**，会与 Pi 已验证的 ADR-0007「代码面统一 `--radius-md`=8px」冲突。只抄"角色→档位"的映射思路：代码块/终端/工具卡 = 大档；行内 code/action = 小档；气泡 = 独立档（Pi 已有 `--radius-bubble`）。
   - **强调色**：DSH 浅色 UI 强调其实是**近黑**（`brand-primary #0f1115`），蓝只用于链接/焦点/业务状态；Pi 的强调是赤陶 `#d97757`（ADR-0005）。抄令牌结构、别抄值。

4. **代码面**：DSH 代码块底色浅色 `#f9fafb`（近白）**并带一个 sticky banner**（语言标签 + 复制按钮）。Pi 的 ADR-0007 已决定「代码面随主题（浅 `#eceae1`）+ 统一 `--radius-md` + hairline 边框 + markdown 代码块带头部栏（语言 + Copy）」——**方向一致**，可放心对齐 DSH 的 banner 细节：`padding: 9px 14px`、语言标签等宽 11px/18px、`position: sticky; top:0`、banner 底色比代码体亮一档、`<pre>` 内边距 16px、`overflow-x:auto`。

5. **工具卡**：DSH 的"摘要行 24px 高 + hover 时图标换成 chevron + 展开体左缩进 4px + 展开体是同一套代码面"这套几何非常容易移植，且**不依赖任何主题色**（除 error/stopped 两种 summary 色）。建议 Pi 直接采用：
   - 行高 24px（Pi `--leading-callout` 已是 24px）；leading 16px 盒 + 6px 间隔 + 标题 + 2×2px 圆点分隔 + summary 撑满截断；
   - 状态：只用文字色区分（error → `--danger`、stopped → `--warning`），不要新增彩色徽标；
   - 展开体：`margin: 4px 0 4px 4px`、一体式 code 面、内部滚动（终端 224px / IN-OUT 各 150px / code body 260px）。

6. **思考块**：DSH 思考块**折叠默认、无侧边线、无斜体**，展开正文 = **tertiary 灰 + 13/20**（compact markdown，链接同色带虚线、代码不着色）。Pi 已有 `ThinkingSection.tsx` 与 `--thinking: #6e6d65` + `--thinking-subtle`；建议：正文色用 Pi 的 `--thinking`（或 `--text-3`），样式抄 DSH 的"折叠单行 24px + 展开体左缩进 22px + 上下 4px 内边距 + 流式时右侧 48px 渐隐"。DSH 用 secondary 字号轴让摘要行随字号缩放；Pi 若无字号轴，直接写固定 13/20。

7. **事件语义不可直接映射**
   - DSH 的 `turn-process` / `turn-tail` 是**合成节点**（不是真实消息），承载 Turn 时长与动作行；Pi 的 Turn 折叠条应作为 `TurnView` 的渲染产物，**不要**引入对应的持久化条目类型。
   - DSH 的 `compaction` 只画"模型从这条之后看不到此前历史"的标记，**不替换上文**（`records.ts:187-193`）。Pi 的 `CompactionEntry` 渲染为注解（ADR-0004），语义一致，可对齐文案与视觉。
   - DSH 的 `turn-error` 有专门 code 字段并做本地化映射（`MessageItem.tsx:51-61`：`ACCOUNT_SIGNED_OUT` / `INTERRUPTED` / `QUOTA` / `AUTH`）。Pi 的 `AssistantMessage.errorMessage` + `stopReason`（`pi-types.ts:54-77`）可映射到同构的一组 code，但**别引入 DSH 的具体 code 字符串**。
   - 空态：DSH 无 Session 时整页 Hero，几何可抄 `HeroShell.module.css:5-45`（居中、`max-width: --dsh-composer-card-max-width`、标题 26/32 wt500、gap 12）。
   - 流式：DSH **没有打字光标**，靠 shimmer + 底部运行态；Pi 的 Live Tail 增量可沿用同一策略，比加闪烁 caret 更贴近 DSH。

8. **令牌命名**：Pi 的三层是 `--{tier}-{role}`（`--bg-canvas`、`--text-1`）；DSH 是 `--dsw-{alias|static|specific}-{role}`。**不要引入 `--dsw-*` 前缀**；把 §4.2 的表当"值得覆盖的语义槽位清单"来对照 Pi 的 `tokens.semantic.css` 补缺口。例如 Pi 目前缺"比 `--text-3` 更淡的装饰字"（DSH 用 `--dsw-alias-label-caption` 画分隔圆点与 IO 标签），Pi 可用 `--text-4` 承担；Pi 也缺 diff 专用的"整行铺色 / gutter / marker"三档，可按 DSH 结构在 `tokens.semantic.css` 里补 `--diff-add-bg/-text/-marker` 组。

9. **无障碍/交互契约**：DSH 的 hover 样式全部包在 `@media (hover: hover)`（`docs/web-styling.md:24`），`prefers-reduced-motion` 一律关掉动画（`DisclosureRow.module.css:111-115`、`StateDot.module.css:85-95`、`ChatView.module.css:130-135`）。Pi 已有 reduced-motion 意识，重绘时保持；另外 DSH 的 disclosure 行同时提供 `role=button` + `tabIndex` + `aria-expanded`，按钮形态给 `aria-label`，可直接照搬。

10. **组件拆分建议**（对齐 DSH 分层但用 Pi 的术语）：
    ```
    Transcript (Pi)                 ↔ ChatView + ChatFlow
    TurnView                        ↔ turn-process 控制 + turn-tail 动作行
    ToolGroupView (Pi 已有)         ↔ ChatGroupSeat + process-groups
    MessageViews                    ↔ register-node-renderers 的分发
    ThinkingSection                 ↔ ReasoningRow（可抽 useDisclosure）
    ToolCallCard                    ↔ ToolRow + ToolCallTree
    DiffView / Markdown 代码块 / 命令输出 ↔ DiffBlock / CodeBlock / TerminalBlock
    ```
    把 DSH `ui-primitives` 里那几个"形状 + 折叠 + 复制"原语（`DisclosureRow`、`CodeToolbar`+`CodeBlock`、`TerminalBlock`、`DiffBlock`）提炼进 Pi 的 `packages/app/src/ui/`，是收益最高的第一步。

---

## 附：一次性快照（可直接抄的常量）

```css
/* —— 从 DSH 抄进 Pi 时建议保留的"几何/节奏"常量（去掉主题色） —— */
--x-flow-gap: 4px;                 /* 进程行之间 */
--x-answer-gap: 12px;              /* 助手回答与进程行 */
--x-turn-gap: 16px;                /* Turn 控制 / turn tail 前后 */
--x-block-gap: 16px;               /* 助手正文块之间 */
--x-row-height: 24px;              /* 所有 disclosure 行 */
--x-leading-box: 16px;             /* 图标盒 */
--x-leading-gap: 6px;              /* 图标盒 → 标题 */
--x-sep-dot: 2px;                  /* 2×2 圆点分隔，radius 1px */
--x-tool-body-indent: 4px;         /* 工具展开体左侧缩进 */
--x-reasoning-body-indent: 22px;   /* 思考展开体（= 16 + 6） */
--x-bubble-padding: 10px 16px;
--x-bubble-radius: 20px;           /* DSH --dsw-radius-xl */
--x-bubble-max: min(calc(<列宽> * 0.702), 82%);
--x-code-padding: 16px;
--x-code-banner-padding: 9px 14px;
--x-terminal-gutter: 30px;
--x-terminal-output-max: 224px;
--x-io-section-padding: 12px 16px;
--x-io-section-max: 150px;
--x-code-body-max: 260px;
--x-diff-line-padding: 0 22px;
--x-diff-marker-bar: inset 3px 0 0 <marker-color>;
--x-scrollbar-width: 5px;
--x-hairline: 0.5px;
```

```
用户消息：右对齐气泡，无头像，max-width 列宽×0.702 / 82%，padding 10×16，radius 20，pre-wrap
助手消息：全宽左对齐，无气泡无头像，14/24，块间距 16，列宽 clamp(680, 列*0.64, 920)
思考块：单行 24 折叠（摘要 13/20 + 流式右渐隐 48px），展开体 13/20 tertiary，左缩进 22
工具卡：24px 摘要行（16 图标盒 +6 + title 13/24 +8 + 2×2 圆点 +8 + summary 截断），展开体 4px 左缩进
代码块：sticky banner（语言 + Copy，9×14，等宽 11/18）+ pre（16 padding，等宽 11/19），radius 16，0.5px 边
终端卡：左侧 30px gutter 放状态点，banner 9×14，输出 12×14，默认 pre 不换行，内滚 224px
diff：整行铺色 + inset 3px 左侧 marker 竖条，+/- 前缀两字符，无行号列，hunk/meta 用 secondary/tertiary
```

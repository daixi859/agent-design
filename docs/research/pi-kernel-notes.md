# pi 内核调研笔记（会话 / 消息 / 工具调用）

> 调研对象：本机已安装的 pi 内核源码（编译产物）。
> 调研目的：为 Pi Studio（React + Vite 的 pi 会话只读查看器 / 驱动客户端）重新设计 transcript 渲染提供精确的数据模型与事件语义依据。
> 调研方式：只读。通读包内 `dist/**/*.d.ts` 与 `dist/**/*.js`、官方 `docs/*.md`、`schemas/*.json`，并用本机真实 session JSONL 交叉验证。
> 结论中的每一处事实都给出 **绝对路径:行号**。

---

## 0. 安装位置与证据口径

| 项 | 值 |
|---|---|
| 包名 | `@earendil-works/pi-coding-agent` |
| 版本 | `1.5.2` |
| npm 全局根 | `C:\nvm4w\nodejs\node_modules`（`npm root -g` 输出） |
| 包安装路径 | `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent` |
| npm 启动器 | `C:\nvm4w\nodejs\pi.cmd`、`C:\nvm4w\nodejs\pi.ps1` |
| CLI 入口 | `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js` |
| 库入口 | `main`/`types` = `dist/index.js` / `dist/index.d.ts` |
| 另一份全局副本 | `C:\Users\DELL\.bun\bin\pi.exe`；`C:\Users\DELL\.bun\install\global\node_modules\@earendil-works\{pi-agent-core,pi-ai,pi-tui}`（bun 全局目录内**没有** pi-coding-agent 本体） |
| 用户数据目录 | `C:\Users\DELL\.pi\agent`（`piConfig.configDir = ".pi"`）；session 在 `C:\Users\DELL\.pi\agent\sessions\<encoded-cwd>\` |

`C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\package.json:2-3`：

```json
"name": "@earendil-works/pi-coding-agent",
"version": "1.5.2",
```

`package.json:6-13`：

```json
"piConfig": { "configDir": ".pi" },
"bin": { "pi": "dist/bundle/cli.js" },
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
```

**是否有 TypeScript 源码？** 没有 `src/`。只有 `dist/` 下的**编译产物**：每个模块同时有 `*.js`、`*.d.ts`、`*.js.map`（`package.json` 的 `files` 只发布 `dist`、`docs`、`examples`、`schemas`）。但 `.d.ts` 保留了完整类型签名与详尽 TSDoc 注释，`.js` 保留了完整实现逻辑，两者结合足以精确还原数据模型。本笔记因此同时引用 `.d.ts`（类型真相）与 `.js`（行为真相）。

内置工具与核心类型分三层包（均为嵌套依赖，版本同为 1.5.2）：

- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\node_modules\@earendil-works\pi-ai\dist\types.d.ts` — provider 面向的 Message / ContentBlock / Usage / AssistantMessageEvent
- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts` — AgentMessage 扩展联合、AgentEvent、AgentToolResult
- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\core\*.d.ts` — coding-agent 自己的 SessionEntry、tools、bashExecution 等

包内还自带官方权威文档（对渲染语义最有价值的三篇）：

- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\docs\session-format.md`（会话 JSONL 格式）
- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\docs\message-types.md`（消息与 content block）
- `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\docs\json.md`（JSON 事件流协议）

---

## 1. 包名 / 版本 / 入口 / 源码形态

见第 0 节表格。

`pi.cmd` 的实际启动行（`C:\nvm4w\nodejs\pi.cmd`）：

```bat
"%_prog%"  "%dp0%\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js" %*
```

---

## 2. Session 落盘 JSONL 的 Entry / SessionEntry 完整定义

真相来源：`C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\core\session-manager.d.ts`。

### 2.1 版本常量与 Header

`session-manager.d.ts:4-12`：

```ts
export declare const CURRENT_SESSION_VERSION = 3;
export interface SessionHeader {
    type: "session";
    version?: number;
    id: string;
    timestamp: string;
    cwd: string;
    parentSession?: string;
}
```

版本演进（`docs\session-format.md:22-30`）：v1 线性、v2 引入 `id/parentId` 树、v3 把 `hookMessage` 角色重命名为 `custom`。`dist\core\session-manager.js:55-65` 是 v2→v3 的迁移实现（把 `message.role === "hookMessage"` 改写为 `"custom"`）。**渲染端必须容忍 `version` 缺省（=1）与旧角色名**。

### 2.2 Entry 基类

`session-manager.d.ts:17-22`：

```ts
export interface SessionEntryBase {
    type: string;
    id: string;
    parentId: string | null;
    timestamp: string;      // ISO 8601 字符串
}
```

- `id`：通常 8 位十六进制，可能退化为完整 UUID（`docs\session-format.md:56`）。
- `timestamp`：**ISO 8601 字符串**，注意与消息内 `timestamp`（Unix 毫秒）不同（`docs\session-format.md:47`）。

### 2.3 全部 entry type 枚举

`session-manager.d.ts:128`：

```ts
export type SessionEntry = SessionMessageEntry | ThinkingLevelChangeEntry | ModelChangeEntry
  | UsageEntry | CompactionEntry | BranchSummaryEntry | CustomEntry | CustomMessageEntry
  | ContextEditEntry | LabelEntry | SessionInfoEntry;

export type FileEntry = SessionHeader | SessionEntry;   // :130
```

逐项字段（均在 `session-manager.d.ts`）：

| type | 行号 | 关键字段 |
|---|---|---|
| `message` | 23-26 | `message: AgentMessage` |
| `thinking_level_change` | 27-30 | `thinkingLevel: string` |
| `model_change` | 31-35 | `provider: string`、`modelId: string` |
| `usage` | 36-45 | `kind`、`provider`、`model`、`usage: Usage`、`note?` |
| `compaction` | 46-59 | `summary`、`firstKeptEntryId`、`tokensBefore`、`details?`、`usage?`、`fromHook?`、`systemMessage?` |
| `branch_summary` | 60-70 | `fromId`、`summary`、`details?`、`usage?`、`fromHook?` |
| `custom` | 81-85 | `customType`、`data?` |
| `label` | 87-91 | `targetId`、`label: string \| undefined` |
| `session_info` | 93-96 | `name?: string` |
| `custom_message` | 109-115 | `customType`、`content`、`details?`、`display: boolean` |
| `context_edit` | 119-126 | `targetId`、`replacement: { content } \| null` |

原文摘录（`session-manager.d.ts:46-59`、`109-126`）：

```ts
export interface CompactionEntry<T = unknown> extends SessionEntryBase {
    type: "compaction";
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: T;
    usage?: Usage;
    fromHook?: boolean;
    systemMessage?: SystemMessage;   // 压缩边界处完整的 prompt/tool 快照
}
export interface CustomMessageEntry<T = unknown> extends SessionEntryBase {
    type: "custom_message";
    customType: string;
    content: string | (TextContent | ImageContent)[];
    details?: T;
    display: boolean;
}
export interface ContextEditEntry extends SessionEntryBase {
    type: "context_edit";
    targetId: string;
    replacement: { content: ContextEditableContent } | null;
}
```

### 2.4 会话树与列表元数据

`session-manager.d.ts:132-177`：

```ts
export interface SessionTreeNode { entry: SessionEntry; children: SessionTreeNode[]; label?: string; labelTimestamp?: string; }
export interface SessionInfo {
    path: string; id: string; cwd: string; name?: string; parentSessionPath?: string;
    created: Date; modified: Date; messageCount: number; firstMessage: string; allMessagesText: string;
}
```

树语义（`docs\session-format.md:209-222`）：`parentId: null` 为根；`getTree()` 返回防御性拷贝；导航 API 可能产生多个根。`SessionManager.getTree()` 定义在 `session-manager.d.ts:347`。

真实样例（本机）：`C:\Users\DELL\.pi\agent\sessions\--D--workspace-mycode-agent-design--\2026-11-16T09-58-45-119Z_01a1e3cb-787f-70a2-bc2e-88a9a92c3b04.jsonl:1-3`

```json
{"type":"session","version":3,"id":"01a1e3cb-787f-70a2-bc2e-88a9a92c3b04","timestamp":"2026-11-16T09:58:45.119Z","cwd":"D:\\workspace\\mycode\\agent-design"}
{"type":"model_change","id":"21baea67","parentId":null,"timestamp":"2026-11-16T09:58:45.318Z","provider":"opendesign","modelId":"deepseek-v4.1-flash"}
{"type":"thinking_level_change","id":"e2ab4763","parentId":"21baea67","timestamp":"2026-11-16T09:58:45.318Z","thinkingLevel":"max"}
```

> 渲染提示：`model_change` 与 `thinking_level_change` 常常**紧跟在 header 之后、没有 message**，是「会话开局」而非「用户操作」，UI 需要区分这两种呈现。

---

## 3. 消息类型全集与 content block 判别联合

### 3.1 基础四角色（pi-ai）

`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:450`（相对包根）：
`type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;`

- `SystemMessage`：`types.d.ts:360-376`，字段 `role:"system"`、`content: string | TextContent[]`、`sections?: Record<string,string|null>`、`toolsAdded?: Tool[]`、`toolsRemoved?: ToolReference[]`、`timestamp`。
- `UserMessage`：`types.d.ts:377-381`，`content: string | (TextContent | ImageContent)[]`、`timestamp`。
- `AssistantMessage`：`types.d.ts:382-413`（见第 4/8 节）。
- `ToolResultMessage`：`types.d.ts:434-449`（见第 5 节）。

### 3.2 coding-agent 扩展四角色

`C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\core\messages.d.ts:16-58`：

```ts
export interface BashExecutionMessage {
    role: "bashExecution";
    command: string;
    output: string;
    exitCode: number | undefined;
    cancelled: boolean;
    truncated: boolean;
    fullOutputPath?: string;
    timestamp: number;
    excludeFromContext?: boolean;   // !! 前缀，不进 LLM 上下文
}
export interface CustomMessage<T = unknown> {
    role: "custom";
    customType: string;
    content: string | (TextContent | ImageContent)[];
    display: boolean;
    details?: T;
    timestamp: number;
}
export interface BranchSummaryMessage { role: "branchSummary"; summary: string; fromId: string | null; timestamp: number; }
export interface CompactionSummaryMessage { role: "compactionSummary"; summary: string; tokensBefore: number; timestamp: number; }
```

这四种角色是通过 declaration merging 注入 `CustomAgentMessages` 的（`messages.d.ts:52-58`），因此 `AgentMessage` 联合在 coding-agent 语境下等价于（`docs\message-types.md:263-277`）：

```ts
type AgentMessage =
  | SystemMessage | UserMessage | AssistantMessage | ToolResultMessage
  | BashExecutionMessage | CustomMessage | BranchSummaryMessage | CompactionSummaryMessage;
```

`AgentMessage` 的底层定义：`\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts:322`：
`type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];`

> 渲染提示：**判别键是 `role`**，且必须写成开放集：`role` 是扩展点（`docs\message-types.md:279`）。Pi Studio 遇到未知 `role` 时不能抛错，应降级为「原始 JSON 展示」。

### 3.3 与 entry.type 的对应关系

`docs\session-format.md:240-247`（`buildSessionContext` 的映射规则）：

- `message` → 直接用 `entry.message`
- `compaction` → 先注入完整 system checkpoint，再注入 `compactionSummary`
- `branch_summary` → `branchSummary`
- `custom_message` → `CustomMessage`
- `context_edit` → 自身不产生消息（只改写目标条目）
- `usage` / `custom` → 不产生上下文消息

---

## 4. assistant content block 的种类与字段

`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:382-384`：

```ts
export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];
```

四种 block 的判别联合（判别键 `type`）：

`types.d.ts:259-291`：

```ts
export interface TextContent   { type: "text";     text: string;      textSignature?: string; }
export interface ThinkingContent { type: "thinking"; thinking: string; thinkingSignature?: string; redacted?: boolean; }
export interface ImageContent  { type: "image";    data: string;      mimeType: string; }   // base64
export interface ToolCall {
    type: "toolCall";
    id: string;                 // 与 toolResult.toolCallId 配对
    name: string;
    arguments: JsonObject;      // 注意字段名是 arguments（不是 args / input / parameters）
    thoughtSignature?: string;
    namespace?: string;         // OpenAI Responses 命名空间 / MCP mcp__ 前缀相关
    argumentsError?: string;    // 参数不是合法 JSON 对象时置位，arguments 退化为 {}
}
```

关键结论（对 UI 直接相关）：

- 文本字段是 **`text`**，思考字段是 **`thinking`**（不是 `text`/`content`）。
- 工具调用参数对象字段名是 **`arguments`**（`JsonObject`，即 `{[key:string]: JsonValue}`，见 `types.d.ts:322-325`）。
- 事件里的 `contentIndex` 与 `content` 数组下标一致。
- `redacted` 的 thinking 可能 `thinking` 为空但有加密载荷（`docs\message-types.md:50`）——UI 不应把它当空块丢弃。

真实样例（本机 session 第 6 行）：

```json
"content":[{"type":"thinking","thinking":"The user says ...","thinkingSignature":"reasoning"},{"type":"text","text":"我当前可用的工具：..."}]
"usage":{"input":59,"output":446,"cacheRead":13312,"cacheWrite":0,"reasoning":131,"totalTokens":13817,"cost":{...}},
"stopReason":"stop","thinkingLevel":"max","durationMs":5704
```

---

## 5. toolCall ↔ toolResult 配对与 toolResult 属性

### 5.1 配对键：`toolCallId`

`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:434-449`：

```ts
export type ToolResultMessage<TDetails = JsonValue> = IsJsonCompatible<TDetails> extends true ? {
    role: "toolResult";
    toolCallId: string;                       // ← 配对键，等于 ToolCall.id
    toolName: string;
    content: (TextContent | ImageContent)[];  // 面向模型的内容
    details?: JsonRepresentation<TDetails>;   // 工具自定义结构，供 UI 渲染
    usage?: Usage;
    nestedCalls?: NestedToolCalls;            // 该工具内部调用的其它工具（如 codemode）
    isError: boolean;
    timestamp: number;                        // Unix ms
    durationMs?: number;                      // 单调时钟测得的执行时长，旧数据可能缺失
} : never;
```

工具自己的返回值形状：`\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts:370-392`：

```ts
export interface AgentToolResult<T = JsonValue | undefined> {
    content: (TextContent | ImageContent)[];
    details: T;
    structuredContent?: JsonValue;  // 不进模型上下文
    usage?: Usage;
    isError?: boolean;
    terminate?: boolean;
}
```

### 5.2 配对在落盘中的实际形态

- 工具调用**内嵌在 assistant message 的 `content` 数组**里（`type: "toolCall"` 的 block）。
- 工具结果**另起一条 `type:"message"` entry**，`message.role === "toolResult"`，通过 `toolCallId` 回指。
- **一个 assistant message 可包含多个 toolCall**，因此会出现「1 条 assistant entry + N 条 toolResult entry」；且并行执行时 `tool_execution_end` 的到达顺序 ≠ 源顺序（`pi-agent-core\dist\types.d.ts:22-24`）。

官方 HTML 导出正是这样配对的 —— `dist\core\export-html\index.js:134-157`（先扫 assistant 的 toolCall 建表，再用 `msg.toolCallId` 找结果）：

```js
if (msg.role === "toolResult" && msg.toolCallId) {
    const existing = renderedTools[msg.toolCallId];
```

以及 `dist\core\export-html\template.js:41-54`：

```js
// Tool call lookup (toolCallId -> {name, arguments})
const toolCallMap = new Map();
...
if (block.type === 'toolCall') toolCallMap.set(block.id, { name: block.name, arguments: block.arguments });
```

`template.js:939-943`：

```js
function findToolResult(toolCallId) {
  for (...) if (entry.message.toolCallId === toolCallId) ...
```

### 5.3 toolResult 的渲染相关细节

- **`isError` 是布尔**，`content` 里的文本已含错误描述（bash 非零退出会追加 `Command exited with code N`，`dist\core\tools\bash.js:325-331`）。
- `details` 是**按工具而异的结构**，是 UI 的主渲染数据源（见第 7 节）。
- `content` 只保证是 `TextContent | ImageContent` 的联合；**图片结果**要读 `data`(base64) + `mimeType`（`template.js:1017-1028` 即此逻辑）。
- `nestedCalls` 记录工具内部调用（`types.d.ts:414-433`），`complete === false` 表示记录被截断/未完成。
- 嵌套调用的**权威结构**在 `dist\extensions\codemode\tool.d.ts:63-81`（`CodemodeToolDetails`）：

  ```ts
  export type CodemodeNestedCallStatus = "running" | "ok" | "error" | "cancelled";
  export interface CodemodeNestedCall {
      id: string;      // `<codemode call id>/<n>`
      name: string;
      args: string;    // Compact JSON of the arguments，**字符串**，为显示而截断
      status: CodemodeNestedCallStatus;
      durationMs?: number;
      error?: string;  // 错误文本，为显示而截断
      cost?: number;   // `models.*` 调用的 USD 成本
  }
  export interface CodemodeToolDetails { calls: CodemodeNestedCall[]; fullOutputPath?: string }
  ```

  `renderer.d.ts:1-8` 说明渲染意图：调用展示脚本，结果列出嵌套调用状态与成本，
  再接脚本输出（**去掉 "Script completed" 头**）；`Elapsed`/`Took` 计时同 bash 行。
  「Nested calls are not separate tool rows because they never reach the model as tool calls.」

- **实测（本机 780 个 session 全量）**：`details.calls` 与 `nestedCalls.calls` 内容一致（998 条同时有），
  共 1937 条嵌套调用，status 分布 `ok=1840 / error=94 / cancelled=3`，`args` 100% 为字符串，
  `cost` 全部缺失（该内核版本未落此字段）。**只有 `codemode` 携带 `calls`**，其余工具的
  `details` 键各不相同（edit→`diff`/`patch`、bash→`fullOutputPath`、grep→`linesTruncated`…）。
- **`isError: true` 时 `details` 依然保留**（`pi-agent-core\dist\types.d.ts:382-386`），不要因为是错误就丢弃 details。

### 5.4 嵌套调用的实时通道（驱动路径实证）

内核有**两个**嵌套调用结构，词汇不同，别混：

| 结构 | 位置 | status 词汇 |
|---|---|---|
| `details.calls`（codemode 自己的） | `extensions/codemode/execute.js:456-478` | `running` / `ok` / `error` / `cancelled` |
| `nestedCalls`（内核通用记录器） | `core/nested-tool-calls.js:56-77` | `unfinished` / `ok` / `error` |

codemode 的 `publish()`（`execute.js:445`）在**每个嵌套调用前后**推 `onUpdate({ content: [], details: snapshot() })`，
被截断/中断的 `running` 在脚本收尾时统一改写成 `cancelled`（`execute.js:540-544`）。

**实测一条真实驱动会话（3 个嵌套调用）的事件顺序**：

```
start   codemode  parent=(顶层)          calls=(无 details)
update  codemode  parent=(顶层)          calls=[]
update  codemode  parent=(顶层)          calls=[read:running]     ← 实时 running
start   read      parent=<codemode id>   calls=(无)
end     read      parent=<codemode id>   calls=(无)
update  codemode  parent=(顶层)          calls=[read:ok]
update  codemode  parent=(顶层)          calls=[read:ok,grep:running]
...
end     codemode  parent=(顶层)          calls=(无)
```

即：**嵌套状态只挂在顶层 codemode 的 `tool_execution_update.partialResult.details.calls` 上**；
子调用自己的 `tool_execution_*` 事件（带 `parentToolCallId`）**不带 aggregate details**。
落盘后的 `toolResult.details.calls` 是终态（全部 `ok`/`error`/`cancelled`，无 `running`）——
服务端进程崩溃或客户端晚连时，`running` 不会留在文件里。

**pi-studio 现状（渗透结论）**：`packages/core/src/normalize.ts` 只映射 5 类事件，
`tool_execution_start/update/end` 一律丢弃（`packages/core/src/normalize.test.ts` 已锁定该行为）。
因此**驱动路径看不到嵌套调用的实时进展**，只能在整轮 `turn_end`/`agent_settled` 后的落盘条目里看到终态。

**另一个实测事实**：`packages/core/src/pi-session-source.ts` 调 `createAgentSession({ sessionManager })`
不传 `resourceLoader`，落回 `DefaultResourceLoader` 且 `extensionFactories` 默认空 →
**内置扩展一个都不加载**，所以 pi-studio 创建/接管的会话里**根本没有 `codemode`**（实测工具数 10，
无 codemode）。pi CLI 有是因为 CLI 自己注入了 `builtInExtensions`
（`dist/extensions/index.js:1-14`，含 codemode / tool-search / mcp / llama.cpp）。

修复路线（已验证）：包根导出里就有工厂，无需深路径（`exports` 只暴露 `.` 与 `./rpc-entry`）：

```ts
import { DefaultResourceLoader, createCodemodeExtension, createToolSearchExtension } from "@earendil-works/pi-coding-agent";
const loader = new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [createCodemodeExtension(), createToolSearchExtension()] });
await loader.reload();
await createAgentSession({ sessionManager, resourceLoader: loader });  // 实测工具数 11，含 codemode
```

真实样例（`C:\Users\DELL\.pi\agent\sessions\--C--Users-DELL--\2026-10-27T12-42-25-436Z_01a17d62-211b-72bd-97b8-d4983555f2c2.jsonl`）：

assistant 里的调用（L15）：

```json
{"type":"toolCall","id":"call_00_ubDdG2civ41Ai5iNgAq02079","name":"edit",
 "arguments":{"path":"C:\\Users\\DELL\\.pi\\agent\\models.json",
              "edits":[{"oldText":"          \"contextWindow\": 200000,\n          \"maxTokens\": 128000,",
                        "newText":"          \"contextWindow\": 256000,\n          \"maxTokens\": 128000,"}]}}
```

对应的结果（L16）：

```json
{"role":"toolResult","toolCallId":"call_00_ubDdG2civ41Ai5iNgAq02079","toolName":"edit","isError":false,
 "content":[{"type":"text","text":"Successfully replaced 1 block(s) in C:\\Users\\DELL\\.pi\\agent\\models.json."}],
 "details":{"diff":"...","patch":"...","firstChangedLine":49},
 "timestamp":1793105002033,"durationMs":6}
```

---

## 6. 运行时事件流：三层事件模型

pi 有**三层**完全不同的事件，Pi Studio 必须分清：

| 层 | 类型 | 用途 | 定义位置 |
|---|---|---|---|
| L1 provider 层 | `AssistantMessageEvent` | 单次 LLM 响应的流式增量 | `pi-ai\dist\types.d.ts:592-645` |
| L2 agent 层 | `AgentEvent` | 一次 agent run 的生命周期 | `pi-agent-core\dist\types.d.ts:461-501` |
| L3 session 层 | `AgentSessionEvent` | 加入会话/压缩/重试/队列等 | `dist\core\agent-session.d.ts:49-111` |

### 6.1 L1：`AssistantMessageEvent`（`pi-ai\dist\types.d.ts:592-645`）

```ts
{ type: "start";          partial: AssistantMessage }
{ type: "text_start";     contentIndex; partial }
{ type: "text_delta";     contentIndex; delta: string; partial }
{ type: "text_end";       contentIndex; content: string; partial }
{ type: "thinking_start"; contentIndex; partial }
{ type: "thinking_delta"; contentIndex; delta: string; partial }
{ type: "thinking_end";   contentIndex; content: string; partial }
{ type: "toolcall_start"; contentIndex; partial }
{ type: "toolcall_delta"; contentIndex; delta: string; partial }   // delta 是参数 JSON 片段
{ type: "toolcall_end";   contentIndex; toolCall: ToolCall; partial }
{ type: "done";           reason: "stop"|"length"|"toolUse"|"deferred"; message: AssistantMessage }
{ type: "error";          reason: "aborted"|"error"; error: AssistantMessage }
```

语义要点（`pi-ai\dist\types.d.ts:576-591` 注释）：`partial` 是「到目前为止的累积消息」，**不是事件瞬间快照**；`*_start` 时对应 block 为空，靠 `*_delta` 增长，直到 `*_end` 才是权威内容；**收 `*_end` / `message_end` 后必须用权威值整体替换重建结果**。

### 6.2 L2：`AgentEvent`（`pi-agent-core\dist\types.d.ts:461-501`）

```ts
| { type: "agent_start" }
| { type: "agent_end";    messages: AgentMessage[] }
| { type: "turn_start" }
| { type: "turn_end";     message: AgentMessage; toolResults: ToolResultMessage[] }
| { type: "message_start"; message: AgentMessage }
| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
| { type: "message_end";   message: AgentMessage }
| { type: "tool_execution_start";  toolCallId; toolName; args: any }
| { type: "tool_execution_update"; toolCallId; toolName; args; partialResult: any }
| { type: "tool_execution_end";    toolCallId; toolName; result: any; isError: boolean; durationMs?: number }
```

turn 的定义：**一个 assistant 响应 + 它触发的全部工具调用与结果**（`docs\json.md:71`）。

### 6.3 L3：`AgentSessionEvent`（`dist\core\agent-session.d.ts:49-111`）

在 L2 基础上：

- 全部 `tool_execution_*` 增加可选 **`parentToolCallId`**（嵌套工具调用，`agent-session.d.ts:42-47`）。
- `agent_end` 增加 `willRetry: boolean`。
- 新增 `agent_settled { aborted }`（**真正空闲**的判定点：不再有自动重试/压缩恢复/排队消息）。
- `queue_update { steering: readonly string[]; followUp: readonly string[] }`。
- `compaction_start { reason: "manual"|"threshold"|"overflow" }`。
- `compaction_end { reason; result: CompactionResult|undefined; aborted; willRetry; errorMessage? }`。
- `entry_appended { entry: SessionEntry }`、`session_info_changed { name }`、`thinking_level_changed { level }`。
- 重试族：`auto_retry_start/end`、`summarization_retry_scheduled`、`summarization_retry_attempt_start/finished`。
- `bash_execution_update { id?; delta: string }`（仅 RPC 直连 bash）。

### 6.4 线上（JSON/RPC）事件与 SDK 事件的差异

`dist\modes\json-event.d.ts:1-33` 与 `docs\json.md:74-99`：线上 `message_update` 是 **delta-only**：

- 去掉 SDK 事件的累积 `message` 字段；
- 去掉所有 `assistantMessageEvent.partial`；
- 顶层补 `usage`（最新累积值，可能一直为 0 直到结束）；
- `toolcall_start` 线上额外带 `id` 与 `toolName`。

```ts
type JsonAgentSessionEvent = Exclude<AgentSessionEvent, { type: "message_update" }> | {
    type: "message_update"; usage: Usage;
    assistantMessageEvent: JsonAssistantMessageEvent<AssistantMessageEvent>;
};
```

`docs\json.md:22-30` 还给出硬性 framing 要求：严格 JSONL，**只按 LF 切分**，不能用 Node `readline`（它会把 U+2028/U+2029 也当分隔符）；必须持续消费 stdout。

### 6.5 事件序列样例（`docs\json.md:37-52`）

```json
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":"Review this repository","timestamp":1733234401000}}
{"type":"message_end","message":{"role":"user",...}}
{"type":"message_start","message":{"role":"assistant","content":[],"stopReason":"pending",...}}
{"type":"message_update","usage":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello"}}
{"type":"message_end","message":{"role":"assistant",...}}
{"type":"turn_end","message":{"role":"assistant",...},"toolResults":[]}
{"type":"agent_end","messages":[...],"willRetry":false}
{"type":"agent_settled","aborted":false}
```

---
## 7. 工具清单、参数 schema 与 diff 归属

### 7.1 内核内置工具（权威枚举）

`C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\core\tools\index.d.ts:23-24`：

```ts
export type ToolName = "read" | "bash" | "powershell" | "edit" | "write" | "grep" | "find" | "ls";
export declare const allToolNames: Set<ToolName>;
```

**重要：内核内置只有这 8 个。** 用户提到的 `web_fetch`、`web_search`、`todo_write`、`Agent`、`SubagentWorkflow` 等**不是 pi 内核内置工具**，而是扩展（extension）注册的自定义工具。证据：

- 对 `dist/**/*.js` 全量 grep `todo_write|web_fetch|web_search|TodoWrite` **零命中**（仅命中打包 chunk 里的无关字符串）。
- 本机真实 session 的 system message 里出现了 `web_search` / `web_fetch` / `Agent` / `SubagentWorkflow` / `get_subagent_result` / `steer_subagent` —— 它们来自 `C:\Users\DELL\.pi\agent\extensions` 下的扩展，经由自定义 schema 注册（`ToolDefinition` 见 `dist\core\extensions\types.d.ts:473-539`）。

> **对 Pi Studio 的硬约束**：工具名与参数 schema **不能硬编码**。权威来源有两处：
> 1. 会话 JSONL 中 system message 的 `toolsAdded[]`（含 `name/description/parameters`，`docs\session-format.md:80-84`）；
> 2. 实时事件的 `tool_execution_start.toolName` + `args`。
> UI 应按 `name` 分派到「已知渲染器」，未知则走通用 JSON 渲染（这正是官方 HTML 导出的做法：`template.js:1052-1170` 的 `switch` + `default` 回退）。

### 7.2 各内置工具的 arguments 字段名

| 工具 | schema 证据 | arguments 字段 |
|---|---|---|
| `read` | `dist\core\tools\read.d.ts:6-10` | `path`（必填）、`offset?`(1-indexed)、`limit?` |
| `bash` | `dist\core\tools\bash.d.ts:6-9` | `command`、`timeout?`（**秒**） |
| `powershell` | `dist\core\tools\powershell.d.ts` | 同 bash |
| `edit` | `dist\core\tools\edit.d.ts:5-11` | `path`、`edits: {oldText,newText}[]` |
| `write` | `dist\core\tools\write.d.ts:4-7` | `path`、`content` |
| `grep` | `dist\core\tools\grep.d.ts:5-13` | `pattern`、`path?`、`glob?`、`ignoreCase?`、`literal?`、`context?`、`limit?` |
| `find` | `dist\core\tools\find.d.ts:8-12` | `pattern`、`path?`、`limit?` |
| `ls` | `dist\core\tools\ls.d.ts:5-8` | `path?`、`limit?` |

原文（`dist\core\tools\edit.js:10-21`）：

```js
const replaceEditSchema = Type.Object({
    oldText: Type.String({ description: "Exact text for one targeted replacement. ..." }),
    newText: Type.String({ description: "Replacement text for this targeted edit." }),
}, {});
const editSchema = Type.Object({
    path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
    edits: Type.Array(replaceEditSchema, { description: "One or more targeted replacements. ..." }),
}, {});
```

### 7.3 edit 工具：字段命名陷阱与 diff 归属

**陷阱 1 —— 不存在 `old_string` / `new_string`。** pi 用的是 `edits[].oldText` / `edits[].newText`，且支持**一次多段编辑**。

**陷阱 2 —— 历史上曾用顶层 `oldText/newText`。** `CHANGELOG.md:3220` 记载：内置 edit 工具现在用 `prepareArguments` 静默地把旧式顶层 `oldText/newText` 折叠进 `edits[]`，以便恢复旧会话。`edits[]` 作为唯一形态始于 `CHANGELOG.md:3235`。兼容逻辑在 `dist\core\tools\edit.js:41-71`：`edits` 若是字符串（部分模型会序列化成字符串）或单个对象，都会被归一化为数组；顶层 `oldText/newText` 会被折叠进 `edits`。**因此旧会话里可能出现顶层 `oldText/newText` 形态的历史 toolCall，渲染端要兼容两种。**

**diff 由内核产生，不是客户端计算。** 证据链：

1. 类型：`dist\core\tools\edit.d.ts:17-24`

```ts
export interface EditToolDetails {
    /** Display-oriented diff of the changes made */
    diff: string;
    /** Standard unified patch of the changes made */
    patch: string;
    /** Line number of the first change in the new file (for editor navigation) */
    firstChangedLine?: number;
}
```

2. 生成时机：`dist\core\tools\edit.js:120-137` —— **写盘前**先算 diff，再 `writeFile`，最后把 `editDiff` 放进 `details`：

```js
const { baseContent, newContent, replacements } = applyEditsToNormalizedContent(normalizedContent, edits, path);
// Diff before writing, so diff computation cannot fail after the write.
const editDiff = generateEditDiff(path, baseContent, newContent, replacements);
...
return {
    content: [{ type: "text", text: "Successfully replaced N block(s) in <path>." }],
    details: editDiff,
};
```

（返回文本的真实模板串见源文件 `edit.js:133`，形如 `Successfully replaced ${edits.length} block(s) in ${path}.`。）

3. diff 算法：`dist\core\tools\edit-diff.d.ts:71-108`，`generateUnifiedPatch()`（标准 patch）与 `generateDiffString()` / `generateEditDiff()`（带行号的展示用 diff）；模糊匹配 `fuzzyFindText` 在 `edit-diff.d.ts:53-59`。另有 `computeEditsDiff()`（`edit-diff.d.ts:99-103`）供 TUI **执行前预览**。

**`details.diff` 的实际格式**（本机真实数据，见第 5.3 节引用的 session L16）：

```diff
   45             "output": 0.5,
   46             "cacheRead": 0.01,
   47             "cacheWrite": 0.125
   48           },
- 49           "contextWindow": 200000,
+ 49           "contextWindow": 256000,
   50           "maxTokens": 128000,
```

即：上下文行 = 三空格 + 行号 + 内容；新增行 = `+ ` + 行号 + 内容；删除行 = `- ` + 行号 + 内容。

`details.patch` 是标准 unified diff：

```diff
--- C:\Users\DELL\.pi\agent\models.json
+++ C:\Users\DELL\.pi\agent\models.json
@@ -45,9 +45,9 @@
```

**渲染建议**：优先用 `details.diff`（含行号，是内核为展示准备的）；`details.patch` 用于复制/导出；`firstChangedLine` 用于「跳转到改动处」。客户端**不要自己再算一遍 diff**。

官方 HTML 导出的做法可直接参考 —— `dist\core\export-html\template.js:1103-1119`：

```js
case 'edit': {
  ...
  if (result?.details?.diff) {
    const diffLines = result.details.diff.split('\n');
    html += '<div class="tool-diff">';
    for (const line of diffLines) {
      const cls = line.match(/^\+/) ? 'diff-added' : line.match(/^-/) ? 'diff-removed' : 'diff-context';
      html += '<div class="' + cls + '">' + escapeHtml(replaceTabs(line)) + '</div>';
    }
  }
  ...
}
```

### 7.4 各工具的 `details` 形状（UI 关键）

| 工具 | details 类型 | 字段 | 证据 |
|---|---|---|---|
| `edit` | `EditToolDetails` | `diff`、`patch`、`firstChangedLine?` | `edit.d.ts:17-24` |
| `bash` / `powershell` | `BashToolDetails` | `truncation?: TruncationResult`、`fullOutputPath?` | `bash.d.ts:27-30` |
| `read` | `ReadToolDetails` | `truncation?: TruncationResult` | `read.d.ts:29-31` |
| `grep` | `GrepToolDetails` | `truncation?`、`matchLimitReached?`、`linesTruncated?` | `grep.d.ts:19-23` |
| `find` | `FindToolDetails` | `truncation?`、`resultLimitReached?` | `find.d.ts:18-21` |
| `ls` | `LsToolDetails` | `truncation?`、`entryLimitReached?` | `ls.d.ts:14-17` |
| `write` | `undefined` | —— | `write.d.ts:27` |

### 7.5 TUI 渲染器（可作为设计参照）

每个工具定义都带 `renderCall` / `renderResult`（`dist\core\extensions\types.d.ts:536-538`），渲染上下文 `ToolRenderContext`（同文件 `367-399`）含 `args`、`toolCallId`、`cwd`、`isPartial`、`expanded`、`isError`、`durationMs`、`showImages`、`state`。

内置渲染器目录：`dist\core\tools\renderers\{bash,edit,find,grep,ls,read,write}.js`；通用工具函数 `dist\core\tools\render-utils.d.ts`（`formatToolCallWithArgs`、`formatToolDuration`、`startToolTimer`、`toolTimerText`、`shortenPath`、`renderToolPath`）。注意 `getTextOutput(result, showImages)`（`render-utils.d.ts:11-18`）只拼接 text block——图片需单独处理。

`edit` 渲染器声明了 `renderShell: "self"`（`dist\core\tools\edit.js:88`），即自行绘制外框；其他工具用默认 shell（`types.d.ts:488-489`）。

---

## 8. usage / token / cost 数据结构与挂载点

### 8.1 结构

`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:292-320`：

```ts
export interface Usage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h?: number;   // cacheWrite 中 1h 保留的子集，仅 Anthropic 报
    reasoning?: number;      // 已包含在 output 内，不要再累加
    totalTokens: number;
    cost: {
        input: number; output: number; cacheRead: number; cacheWrite: number;
        total: number;
        totalFromProvider?: boolean;  // true = 供应商实报；false/缺省 = 目录估算
    };
}
```

### 8.2 挂载点（三处，用途不同）

1. **assistant message** —— 主挂载点，必然存在：`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:395` 的 `usage: Usage;`。这是 Pi Studio 逐条消息显示 token/cost 的**唯一可靠来源**。
2. **toolResult message** —— 可选 `usage?`（同文件 441 行），表示该工具内部的嵌套模型调用；**不计入主上下文核算**。
3. **独立的 `usage` entry**（`dist\core\session-manager.d.ts:36-45`）—— 非消息的模型归因用量，例如 `kind: "cache_warm"`。**不计入 LLM 上下文**，但计入会话总额；官方明确要求「未知 kind 应视为普通 usage 而不是拒绝」（`docs\session-format.md:121`）。UI 上 pi 自己**会把 usage entry 从对话树里隐藏**（同文件 121 行）。
4. `compaction` entry 与 `branch_summary` entry 也各带可选 `usage?`（`session-manager.d.ts:53-54`、`66-67`），是生成摘要那次 LLM 调用的花费。

### 8.3 聚合 API（内核已有，客户端不必重造）

`dist\core\usage-totals.d.ts`：

```ts
export interface UsageTotals { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; }
export declare function addUsageToTotals(totals: UsageTotals, usage: Usage): void;   // :11
export declare function combineUsage(first: Usage, second: Usage): Usage;            // :13
export declare function getUsageCostBreakdown(entries: SessionEntry[]): UsageCostBreakdownEntry[]; // :20
export interface UsageCostBreakdownEntry { key: string; cost: number; tokens: number; }
```

- `dist\core\agent-session.d.ts:204-221` 的 `SessionStats`（会话级）：

```ts
export interface SessionStats {
    sessionFile: string | undefined;
    sessionId: string;
    userMessages: number; assistantMessages: number;
    toolCalls: number; toolResults: number; totalMessages: number;
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost: number;
    contextUsage?: ContextUsage;
}
```

`agent-session.d.ts:911-916` 注释强调：`getSessionStats()` 聚合**全部** entries（含已被压缩掉的历史），所以 token/成本反映真实计费。

- 上下文占用：`dist\core\extensions\types.d.ts:217-223`

```ts
export interface ContextUsage { tokens: number | null; contextWindow: number; percent: number | null; }
```

- 官方 HTML 导出的聚合实现可直接抄：`dist\core\export-html\template.js:1456-1503`（`computeStats`）。

### 8.4 渲染提示

- `cost.total` 可能**故意与四项分项之和不相等**（供应商实报 vs 目录估算），代码显式兜底：`cost.total` 非数字时才用分项和（`template.js:1485-1487`）。
- `reasoning` 已含在 `output` 内（`docs\message-types.md:90`）。

---

## 9. 会话元数据：cwd / 模型 / thinking level / 标题

| 元数据 | 来源 | 证据 |
|---|---|---|
| `cwd` | `SessionHeader.cwd`（每个会话固定）；旧会话可能为空串 | `session-manager.d.ts:10`；`SessionInfo.cwd` 注释「Empty string for old sessions」`session-manager.d.ts:166` |
| 模型 id | `model_change` entry 的 `provider` + `modelId`；逐条消息另有 `assistant.model` / `provider` / `api` / `responseModel` | `session-manager.d.ts:31-35`；`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:385-389` |
| thinking level | `thinking_level_change` entry 的 `thinkingLevel`；assistant message 上另有 `thinkingLevel?`（请求级别）与 `providerThinkingLevel?`（供应商原生级别） | `session-manager.d.ts:27-30`；`\node_modules\@earendil-works\pi-ai\dist\types.d.ts:390-393` |
| 会话标题 / 显示名 | `session_info` entry 的 `name`，取**最新一条** | `session-manager.d.ts:93-96`、`283-284` |
| 会话标题（无 name 时） | `SessionInfo.firstMessage` —— 官方备注：设置 name 后选择器显示 name 而非首条消息 | `session-manager.d.ts:175`；`docs\session-format.md:207` |
| 父会话 | `SessionHeader.parentSession`（fork/clone 产生） | `session-manager.d.ts:11`；`docs\session-format.md:72-76` |
| 恢复后的模型/thinking | `SessionProjection.model` / `.thinkingLevel` | `session-manager.d.ts:146-154` |

`ThinkingLevel` 取值（`\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts:300`）：

```ts
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
```

注意 `xhigh` / `max` 仅部分模型族支持，需按模型元数据探测（同处 296-299 行注释）。

**重要的一处陷阱**：模型可能是**虚拟模型**（virtual model），此时 `model_change` 记录的是虚拟选择，而 assistant message 记录的是真正回答的物理模型（`docs\session-format.md:99`、`session-manager.d.ts:320-329`）。虚拟模型路由状态以 `custom` entry 持久化，`customType = "pi.virtual-model-state"`（`docs\session-format.md:174`）。

---

## 10. 与「渲染 transcript」直接相关的语义

### 10.1 时间戳有两套粒度，别混用

- **entry 层 `timestamp`：ISO 8601 字符串**，用于排序与展示时刻。
- **message 层 `timestamp`：Unix 毫秒整数**。
- 明文依据：`docs\session-format.md:47` —— 「Session entry timestamps are ISO 8601 strings. The nested message timestamp is a Unix timestamp in milliseconds.」
- 排序时官方是 `new Date(entry.timestamp).getTime()`（`template.js:103-105`）。

### 10.2 toolResult 是否已被截断：看 `details.truncation`，不要看文本

`dist\core\tools\truncate.d.ts:13-42`：

```ts
export interface TruncationResult {
    content: string;              // 截断后的内容（与 message.content 重复）
    truncated: boolean;
    truncatedBy: "lines" | "bytes" | null;
    totalLines: number; totalBytes: number;
    outputLines: number; outputBytes: number;
    lastLinePartial: boolean;     // 尾截断可能产生半行
    firstLineExceedsLimit: boolean;
    maxLines: number; maxBytes: number;
}
```

默认上限：**2000 行 / 50KB，谁先到算谁**（`truncate.d.ts:5-11`；`DEFAULT_MAX_LINES = 2000`、`DEFAULT_MAX_BYTES`、`GREP_MAX_LINE_LENGTH = 500`）。

**双保险设计**：截断时内核会把说明文字**追加进 `content[0].text`**，同时把结构化信息放进 `details`：

- bash 尾部截断（`dist\core\tools\bash.js:257-276`）：
  `[Showing lines X-Y of N. Full output: <temp path>]` 或 `[Showing last X of line Y (line is Z). Full output: ...]`
- read 头部截断（`dist\core\tools\read.js:252-276`）：
  `[Showing lines X-Y of N. Use offset=K to continue.]`、`[N more lines in file. Use offset=K to continue.]`、以及整行超限时的 bash 兜底提示。

真实样例（本机）：

```text
[Showing lines 26323-26837 of 26837 (50.0KB limit). Full output: C:\Users\DELL\AppData\Local\Temp\pi-powershell-dbdd5f3b233f722a.log]
```

**渲染建议**：折叠/展开判定用 `details.truncation.truncated`；同时提供 `fullOutputPath` 的「完整输出在临时文件」提示。注意官方 HTML 导出**在最终结果里会把这段 footer 从正文中剪掉**（因为 `details` 已单独呈现）—— `dist\core\tools\renderers\bash.js:23-33`：

```js
if (!options.isPartial && truncation?.truncated && fullOutputPath && output.endsWith("]")) {
    const footerStart = output.lastIndexOf("\n\n[");
    if (footerStart !== -1 && output.slice(footerStart).includes(fullOutputPath)) {
        output = output.slice(0, footerStart).trimEnd();
    }
}
```

### 10.3 bash 输出的 stdout/stderr 结构

**内核不做 stdout/stderr 分流，二者合并成一条文本流。**

- `BashResult.output` 注释即为「Combined stdout + stderr output (sanitized, possibly truncated)」（`dist\core\bash-executor.d.ts:15-21`）。
- 底层实现把两个流接到同一个 `onData`（`dist\core\tools\bash.js:113-114`）：

```js
// Stream stdout and stderr.
child.stdout?.on("data", onData);
child.stderr?.on("data", onData);
```

- `BashExecutionMessage.output` 同样是合并结果（`dist\core\messages.d.ts:19`）。
- 结构化结果 `BashToolOutput`（给 codemode 等程序化调用者）也只有 `output`（`dist\core\tools\bash.d.ts:19-26`）：

```ts
{ output: string; truncated: boolean; full_output_path?: string; exit_code: number; wall_time_seconds: number; }
```

**结论：Pi Studio 无法也不应该尝试分离 stdout/stderr。** 需要区分的话只能靠 ANSI 颜色或退出码。「成功/失败」的判定：`toolResult.isError`，或 `bashExecution` 消息的 `cancelled || (exitCode !== 0 && exitCode !== null)`（后者是官方 HTML 导出的写法，`template.js:1388`）。

其他 bash 细节：

- 非零退出**不抛异常**，而是 `isError: true` + 正文追加 `Command exited with code N`（`bash.js:325-331`）。
- 超时/中止会把状态追加进正文：`Command timed out after N seconds`、`Command aborted`（`bash.js:294-306`）。
- 空输出显示为 `(no output)`（`bash.js:257`）。
- 输出是**流式**的：`tool_execution_update.partialResult` 的节流是 **100ms**（`BASH_UPDATE_THROTTLE_MS`，`dist\core\tools\renderers\bash.js:15`）。
- TUI 端默认只预览最后 5 行（`BASH_PREVIEW_LINES = 5`，同文件 14 行）。
- bash/powershell 输出常含 **ANSI 转义序列**（`\u001b[31;1m`，本机 session L150 可见）。官方导出用 `ansi-to-html` 转换（`dist\core\export-html\ansi-to-html.js`，`template.js` 里 class `ansi-rendered`）。**Pi Studio 必须做 ANSI 清洗或渲染**，否则会看到乱码。

### 10.4 工具输出的「折叠 / 展开」是内核的既有维度

- 渲染上下文有 `expanded` 与 `isPartial`（`dist\core\extensions\types.d.ts:360-365`、`385-387`）。
- 有全局开关 `getToolsExpanded()` / `setToolsExpanded()`（`extensions\types.d.ts:212-215`）。
- HTML 导出对文本用 `formatExpandableOutput(text, maxLines, lang)`：bash 5 行、read 10 行、write 10 行、ls 20 行、嵌套调用 1 行（`template.js:1059/1076/1095/1133/1042`）。
- assistant 消息分两轮渲染：**先渲染所有 text/thinking block，再渲染所有 toolCall block**（`template.js:1360-1375`）。这暗示 pi 官方认为「先看模型说了什么，再看它做了什么」是更自然的阅读顺序 —— Pi Studio 可参考，亦可刻意改为交错渲染，但要知道上游的选择。

### 10.5 图片与多模态

- content block 的图片是 `{ type:"image", data: base64, mimeType }`。
- assistant / user / toolResult 都可能含图片。
- 图片自动缩放由 read 工具负责（`read.d.ts:52-58`，`autoResizeImages` 默认 true），并在同一条结果的 text block 里写 `Read image file [image/png]` + 缩放提示（`read.js:224-234`）。
- 官方 HTML 导出用 `data:<mimeType>;base64,<data>` 直接内联（`template.js:1017-1028`、`1340-1347`）。

### 10.6 特殊内容的判别

- **skill 调用**：官方在**用户文本里**解析 skill 块并单独渲染（`template.js:1297-1334` 调 `parseSkillBlock`）。解析器在 `dist\core\agent-session.d.ts:30-41`：

```ts
export interface ParsedSkillBlock { name: string; location: string; content: string; userMessage: string | undefined; }
export declare function parseSkillBlock(text: string): ParsedSkillBlock | null;
```

- **system message**：区分「首条（=系统提示词）」与「后续更新」；后续更新渲染 `toolsAdded` / `toolsRemoved`（`template.js:1403-1419`；判断函数 `isLeadingSystemEntry` 在同文件）。
- **`custom_message`**：`display === false` 表示终端里隐藏，但官方导出提供了「Show hidden messages」开关（`template.js:1441-1447`、`1532`）。Pi Studio 建议同样默认隐藏 + 可切换。
- **`custom` / `usage` entry**：官方**不渲染进 transcript**（`template.js:480` 的过滤条件、`docs\session-format.md:121`）。
- **`label` entry**：不进 transcript，只作为树节点的标记。
- **`context_edit` entry**：只改模型上下文，**原始历史与 UI 不变**（`docs\session-format.md:139-147`）—— Pi Studio 若同时展示「模型看到的」与「历史真实的」，需要两套视图。
- **compaction**：官方导出的渲染是「Compacted from N tokens」折叠块 + summary（`template.js:1426-1432`）：

```js
if (entry.type === 'compaction') {
  return '<div class="compaction" ...>
    <div class="compaction-label">[compaction]</div>
    <div class="compaction-collapsed">Compacted from ' + entry.tokensBefore.toLocaleString() + ' tokens</div>
    ...' + escapeHtml(entry.summary) + '...
  </div>';
}
```

### 10.7 性能 / 增量语义

- `message_update` 在线上是 delta-only，就是为了保持流大小线性（`dist\modes\json-event.d.ts:25-31`）。
- 实时重建规则（`docs\json.md:93`）：用 `contentIndex` 定位 block，缓冲 `delta` 做实时显示，**收到 `*_end` 用权威内容替换**，收到 `message_end` **用 `message` 整体替换部分消息**。
- `stopReason: "pending"` 只存在于流式中，**不会落盘**（`docs\message-types.md:145`）。
- 工具并行执行时 `tool_execution_end` 按**完成顺序**到达，而 tool-result 消息按 **assistant 源顺序**到达（`\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts:22-24`）。UI 若按事件到达顺序 append，会出现工具行跳动 —— 应改为按 assistant 源顺序占位。

### 10.8 树 / 分支渲染

- 会话是**append-only 树**，`leafId` 指向当前位置（`session-manager.d.ts:218-228`）。
- `SessionTreeNode { entry, children, label?, labelTimestamp? }`（`session-manager.d.ts:132-139`）。
- 官方 HTML 导出从 `parentId` 重建树、按 `timestamp` 排序子节点、并计算「根到目标的活跃路径」（`template.js:73-108`、`buildActivePathIds` 在 114 行起）。
- `compaction` 会影响「活跃 entry 列表」：`buildContextEntries()` 只保留最新 compaction + 从 `firstKeptEntryId` 起的条目（`session-manager.d.ts:190-198`；`docs\session-format.md:224-235`）。**若 Pi Studio 想渲染「完整历史」而非「模型上下文」，必须用 `getEntries()` 而不是 `buildContextEntries()`。**

---

## 11. 对 Pi Studio transcript 重设计的结论清单

1. **数据源分层**：浏览路径读 JSONL（`SessionEntry[]` + `SessionHeader`），驱动路径读事件流（`JsonAgentSessionEvent`）。两者数据结构不同，不要强行归一化。
2. **渲染主键**：`entry.id`（树节点）与 `toolCallId`（工具行）。时间显示用 entry 的 ISO `timestamp`；模型/延迟信息用 message 的毫秒 `timestamp` 与 `durationMs`。
3. **消息判别**：外层 `entry.type`，内层 `message.role`，block 层 `block.type`。三层都要写成开放集并做 fallback。
4. **工具渲染协议**：以 `toolName` 分派；参数取 `toolCall.arguments`；结果取 `toolResult.content` + `toolResult.details`；配对键 `toolCallId`。
5. **edit 必须用 `details.diff`**（内核产出，带行号），不要自己 diff；同时兼容历史 `oldText/newText` 与现行 `edits[]`。
6. **bash 无 stdout/stderr 分离**；必须处理 ANSI；截断 footer 与 `details.truncation` 二选一呈现，避免重复。
7. **usage 只在 assistant message 上必然存在**；toolResult 的 usage 与独立 usage entry 是额外项，展示时要区分口径。
8. **元数据取值**：cwd 取 header；模型/thinking 取最近的 `model_change`、`thinking_level_change`，并注意 assistant message 上的物理模型与请求级别；标题取最新 `session_info.name`，否则 `firstMessage`。

---

## 附录 A：关键文件绝对路径索引

内核包根 `PKG` = `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent`

| 用途 | 路径 |
|---|---|
| package.json | `PKG\package.json` |
| 会话 entry 类型 | `PKG\dist\core\session-manager.d.ts` / `.js` |
| coding-agent 扩展消息 | `PKG\dist\core\messages.d.ts` |
| 基础消息与 Usage | `PKG\node_modules\@earendil-works\pi-ai\dist\types.d.ts` |
| AgentMessage / AgentEvent | `PKG\node_modules\@earendil-works\pi-agent-core\dist\types.d.ts` |
| 会话事件 | `PKG\dist\core\agent-session.d.ts` |
| 线上事件裁剪 | `PKG\dist\modes\json-event.d.ts` |
| RPC 协议 | `PKG\dist\modes\rpc\rpc-types.d.ts`、`PKG\docs\rpc-commands.md` |
| 工具清单 | `PKG\dist\core\tools\index.d.ts` |
| 各工具 schema | `PKG\dist\core\tools\{read,bash,powershell,edit,write,grep,find,ls}.d.ts` |
| edit diff 算法 | `PKG\dist\core\tools\edit-diff.d.ts` / `.js` |
| 截断语义 | `PKG\dist\core\tools\truncate.d.ts` |
| 工具渲染器 | `PKG\dist\core\tools\renderers\*.js`、`PKG\dist\core\tools\render-utils.d.ts` |
| bash 结果结构 | `PKG\dist\core\bash-executor.d.ts` |
| usage 聚合 | `PKG\dist\core\usage-totals.d.ts` |
| 官方 HTML 导出（最佳渲染参照） | `PKG\dist\core\export-html\{index.js,template.js,tool-renderer.js}` |
| 官方文档 | `PKG\docs\{session-format,message-types,json,compaction,rpc-commands}.md` |

## 附录 B：本机真实 session 样例路径

- 会话目录：`C:\Users\DELL\.pi\agent\sessions\`
- 本仓库的会话：`C:\Users\DELL\.pi\agent\sessions\--D--workspace-mycode-agent-design--\`
- 含 edit/read/bash 工具结果的可参考会话：
  `C:\Users\DELL\.pi\agent\sessions\--C--Users-DELL--\2026-10-27T12-42-25-436Z_01a17d62-211b-72bd-97b8-d4983555f2c2.jsonl`
- 含截断 / 错误结果的可参考会话：
  `C:\Users\DELL\.pi\agent\sessions\--C--Users-DELL--\2026-09-22T08-18-30-176Z_01a0c831-ec9f-77e3-a48d-e6e8daf716ef.jsonl`

目录命名规则（`docs\session-format.md:14`）：去掉前导分隔符后，把 `/`、`\`、`:` 替换为 `-`。

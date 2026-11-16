/** Transcript Lab 的 mock 数据（ADR-0013 验收件）。
 *
 * 这里**不产出显示形状，只产出真实 SessionEntry**——样张经 buildTranscriptModel
 * 走完整真实路径（分组、四态、嵌套调用都由线上代码算出）。
 * 字段名与结构严格按 pi 内核（docs/research/pi-kernel-notes.md）：
 * · toolCall 用 `arguments`；edit 用 `edits[{oldText,newText}]`
 * · toolResult 靠 `toolCallId` 配对；`details.diff` 是内核产出
 * · codemode 的 `details.calls[]` 里 `args` 是 **JSON 字符串**、
 *   `status` 取自内核 CodemodeNestedCallStatus（running / ok / error / cancelled）
 * · bash 用 `bashExecution` 角色，取消即 `cancelled: true`
 */
import type { ContentBlock, SessionEntry } from "@pi-studio/shared/pi-types";
import type { MessageKey } from "../../../lib/i18n";

/** 工具在样张里的目标状态（决定生成哪些配对条目） */
export type MockToolState = "running" | "ok" | "error" | "stopped";

export interface MockSubCall {
  id: string;
  name: string;
  args: string;
  /** 内核 CodemodeNestedCallStatus 原文 */
  status: "running" | "ok" | "error" | "cancelled";
  durationMs?: number;
  error?: string;
}

export interface MockTool {
  name: string;
  state: MockToolState;
  /** toolCall.arguments（命令类工具给 command，摘要由模型层提取） */
  args?: Record<string, unknown>;
  /** 折叠区间标记：`details.diff` 原文 */
  diff?: string;
  /** `details.patch`（标准 unified diff）：复制/导出与 diff 缺失时的兜底 */
  patch?: string;
  /** 嵌套调用：`details.calls` 原文 */
  calls?: MockSubCall[];
  /** toolResult 的 text 内容 */
  output?: string;
}

export type MockSegment =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; tool: MockTool }
  | { kind: "text"; text: string };

export interface MockTurn {
  id: string;
  label: MessageKey;
  user?: string;
  at?: string;
  segments: MockSegment[];
  /** assistant 中止/错误：挂到最后一条 assistant 上 */
  warning?: { kind: "aborted" | "error"; text: MessageKey };
  /** 末尾追加 compaction 注解 */
  compaction?: string;
  /** 被弃分支：生成 N 条挂在首个 assistant 之后、没有后继引用的旧条目 */
  abandoned?: number;
  /** 本轮耗时（均摊到条目时间戳上，Recap 的耗时由模型层真实算出） */
  elapsedMs?: number;
  /** 本轮 tokens（挂到最后一条 assistant 的 usage 上，内核形状） */
  tokens?: number;
}

const TS = "2026-11-16T10:58:12.000Z";

/** 真实格式的 edit diff（内核 details.diff：前缀 + 右对齐行号 + 空格 + 内容） */
const EDIT_DIFF = [
  "    ...",
  " 40 export function refreshSession(token: string) {",
  '-41   if (!payload.sub) throw new Error("invalid token")',
  "+41   if (!payload.sub) {",
  '+42     throw new AuthError("invalid token", { cause: token.slice(0, 8) })',
  "+43   }",
  " 44   return extendSession(payload.sub)",
].join("\n");

/** 同一处编辑的标准 unified diff（内核 details.patch 原文；复制/导出用） */
const EDIT_PATCH = [
  "--- a/src/auth/session.ts",
  "+++ b/src/auth/session.ts",
  "@@ -38,7 +38,9 @@ export function refreshSession(token: string) {",
  "   const payload = await verify(token)",
  "-  if (!payload.sub) throw new Error(\"invalid token\")",
  "+  if (!payload.sub) {",
  "+    throw new AuthError(\"invalid token\", { cause: token.slice(0, 8) })",
  "+  }",
  "   return extendSession(payload.sub)",
].join("\n");

/** 宽度 3 的样本：验证行号列随内容变宽 */
const WIDE_DIFF = [
  "     ...",
  " 148       if (buffered.length > 0) {",
  "-149         for (const chunk of buffered) emit(chunk)",
  "+149         for (const chunk of buffered) {",
  "+150           emit(chunk)",
  "+151         }",
  " 152       }",
].join("\n");

export const MOCK_TERMINAL_OUTPUT = [
  "✓ packages/shared (12 tests) 214ms",
  "✓ packages/core   (31 tests) 486ms",
  "✗ packages/app    (48 tests) 1.2s",
  "",
  "  FAIL  src/features/transcript/transcript-model.test.ts > keeps abandoned count",
  "  AssertionError: expected 2 to be 1",
].join("\n");

const CODE_SUCCESS = "Script completed\nWall time 0.1 seconds\nOutput:\n";
const CODE_FAILED = [
  "Script failed",
  "Wall time 30.1 seconds",
  "Output:",
  "### Error",
  "TimeoutError: locator.waitFor: Timeout 30000ms exceeded.",
].join("\n");

export const MOCK_TURNS: MockTurn[] = [
  {
    id: "turn-1",
    label: "labTurnFull",
    user: "登录之后一直重定向回 /login，帮我查一下 session 刷新的逻辑",
    at: TS,
    elapsedMs: 82_000,
    tokens: 41_200,
    compaction: "128k tokens",
    segments: [
      {
        kind: "thinking",
        text: "重定向循环最可能来自守卫读到了过期的 cookie。计划：先看 session.ts 的 refresh 路径，再看登录路由的跳转条件，最后确认 cookie 的 SameSite 设置。\n\n先定位 refreshSession 对 payload.sub 的处理，那里一旦抛错就会被上层当成未登录。",
      },
      { kind: "tool", tool: { name: "read", state: "ok", args: { path: "src/auth/session.ts", offset: 1, limit: 120 }, output: "export async function refreshSession(token: string) {\n  const payload = await verify(token)\n  return extendSession(payload.sub)\n}" } },
      { kind: "tool", tool: { name: "grep", state: "ok", args: { pattern: "refreshSession", path: "src", limit: 40 }, output: "src/auth/session.ts:40:export async function refreshSession(token: string) {\nsrc/auth/guard.ts:18:    await refreshSession(cookie.token)\nsrc/routes/login.ts:52:  refreshSession(token)" } },
      { kind: "tool", tool: { name: "bash", state: "ok", args: { command: "pnpm test --filter auth", timeout: 30 }, output: "✓ src/auth/session.test.ts (6 tests) 312ms\n✓ src/auth/guard.test.ts (4 tests) 188ms" } },
      // text 分隔：之后的工具归入下一个过程组（ADR-0006 的分组边界）
      { kind: "text", text: "先确认了 refresh 路径的问题，接下来动手改。" },
      { kind: "tool", tool: { name: "edit", state: "ok", args: { path: "src/auth/session.ts", edits: [{ oldText: 'if (!payload.sub) throw new Error("invalid token")', newText: 'if (!payload.sub) {\n  throw new AuthError("invalid token", { cause: token.slice(0, 8) })\n}' }] }, diff: EDIT_DIFF, patch: EDIT_PATCH, output: "Successfully replaced 1 block(s) in src/auth/session.ts." } },
      { kind: "tool", tool: { name: "write", state: "ok", args: { path: "src/auth/errors.ts", content: "export class AuthError extends Error {}\n" }, output: "Wrote 42 bytes to src/auth/errors.ts." } },
      { kind: "text", text: "找到了根因：`refreshSession` 在 cookie 过期后仍复用旧 token，守卫随后把用户打回登录页，形成循环。\n\n修复要点：\n\n1. `payload.sub` 缺失时抛专用的 `AuthError`，让上游能区分「过期」与「无效」\n2. 登录路由不再静默续期，交回给用户重新认证\n\n详见上面的 edit diff。" },
    ],
  },
  {
    id: "turn-2",
    label: "labTurnSubagent",
    user: "顺手把这段重试逻辑抽成独立的模块，然后跑一遍全量测试",
    at: "2026-11-16T11:04:37.000Z",
    elapsedMs: 154_000,
    tokens: 68_500,
    abandoned: 2,
    warning: { kind: "error", text: "labWarnTestFailed" },
    segments: [
      { kind: "thinking", text: "抽取时注意别再引入新的闭包捕获；全量测试用 bash，输出可能很长。" },
      {
        kind: "tool",
        tool: {
          name: "codemode",
          state: "ok",
          args: { code: "// 选中驱动按钮并点击\nawait page.click('[data-drive]')" },
          calls: [
            { id: "call_4febc799/1", name: "mcp__playwright__browser_navigate", args: '{"url":"http://localhost:5173/"}', status: "ok", durationMs: 1162 },
            { id: "call_4febc799/2", name: "mcp__playwright__browser_snapshot", args: "{}", status: "ok", durationMs: 208 },
            { id: "call_4febc799/3", name: "bash", args: '{"command":"pnpm test --filter app"}', status: "ok", durationMs: 1840 },
            { id: "call_4febc799/4", name: "read", args: '{"path":"src/lib/stream.ts","limit":40}', status: "ok", durationMs: 46 },
            { id: "call_b2e1/1", name: "mcp__playwright__browser_run_code_unsafe", args: '{"code":"await ta.waitFor({ timeout: 30000 })"}', status: "error", durationMs: 30107, error: "TimeoutError: locator.waitFor: Timeout 30000ms exceeded." },
            // 真实数据里确有 cancelled（内核 CodemodeNestedCallStatus 四态之一）
            { id: "call_b2e1/2", name: "grep", args: '{"pattern":"const pageWidth|const pageHeight","path":"src/print-core/use-print-output.js"}', status: "cancelled" },
          ],
          output: CODE_SUCCESS,
        },
      },
      {
        kind: "tool",
        tool: {
          name: "codemode",
          state: "error",
          args: { code: "// 抓取失败态截图" },
          calls: [
            { id: "call_dad5a1/1", name: "mcp__playwright__browser_run_code_unsafe", args: '{"code":"await page.reload()"}', status: "error", durationMs: 30681, error: "TimeoutError: locator.waitFor: Timeout 30000ms exceeded." },
          ],
          output: CODE_FAILED,
        },
      },
      { kind: "tool", tool: { name: "edit", state: "ok", args: { path: "src/lib/stream.ts", edits: [{ oldText: "for (const chunk of buffered) emit(chunk)", newText: "for (const chunk of buffered) {\n  emit(chunk)\n}" }] }, diff: WIDE_DIFF, output: "Successfully replaced 1 block(s) in src/lib/stream.ts." } },
      { kind: "tool", tool: { name: "bash", state: "error", args: { command: "pnpm test", timeout: 120 }, output: MOCK_TERMINAL_OUTPUT } },
      { kind: "text", text: "抽取完成，但全量测试有一条失败：`transcript-model.test.ts` 里断言被弃分支数是 1，实际拿到了 2 —— 新的重试模块让分支判定多算了一条。" },
    ],
  },
  {
    id: "turn-3",
    label: "labTurnAborted",
    user: "改一下这个断言",
    at: "2026-11-16T11:09:05.000Z",
    elapsedMs: 6_400,
    warning: { kind: "aborted", text: "labWarnAborted" },
    segments: [
      { kind: "tool", tool: { name: "bash", state: "stopped", args: { command: "pnpm test --watch" }, output: "interrupted" } },
      { kind: "text", text: "已停止监听。" },
    ],
  },
];

/** 状态铺满样张：running 态没有配对结果，stopped 态走 bashExecution.cancelled */
export const MOCK_STATE_TURN: MockTurn = {
  id: "turn-states",
  label: "transcriptStates",
  user: "四种工具状态各来一条",
  at: "2026-11-16T11:14:00.000Z",
  elapsedMs: 12_000,
  tokens: 3_100,
  segments: [
    { kind: "tool", tool: { name: "bash", state: "running", args: { command: "pnpm test --filter app" } } },
    { kind: "tool", tool: { name: "grep", state: "ok", args: { pattern: "transcript-model" }, output: "3 matches" } },
    // 只有 patch、没有 details.diff 的历史会话：走 patch 兜底呈现
    { kind: "tool", tool: { name: "edit", state: "ok", args: { path: "src/auth/session.ts" }, patch: EDIT_PATCH, output: "Successfully replaced 1 block(s)." } },
    // 更早的形态：内核没给 diff 也没给 patch，只有请求里的 oldText/newText
    { kind: "tool", tool: { name: "edit", state: "ok", args: { path: "src/auth/errors.ts", oldText: "export class AuthError extends Error {}", newText: "export class AuthError extends Error {\n  readonly code = \"AUTH_INVALID\"\n}" }, output: "Successfully replaced 1 block(s)." } },
    { kind: "tool", tool: { name: "edit", state: "error", args: { path: "src/auth/session.ts" }, output: "Error: oldText not found in file (fuzzy match failed)" } },
    { kind: "tool", tool: { name: "bash", state: "stopped", args: { command: "npm run build" }, output: "build interrupted by user" } },
  ],
};

/** 助手回答里的代码块样张（走 Markdown 渲染路径） */
export const MOCK_ASSISTANT_TEXT = [
  "修好之后，判定逻辑收敛成一句话：",
  "",
  "```ts",
  "export function isRetryable(error: unknown): boolean {",
  "  if (error instanceof AuthError) return false",
  "  return error instanceof TransportError && error.retryable",
  "}",
  "```",
  "",
  "这样 `AuthError` 永远不重试，传输层错误才走退避。",
].join("\n");

// ---------- MockTurn → 真实 SessionEntry 列表 ----------

/**
 * 造一条真正的被弃分支：从首个 assistant 分叉，链尾没有任何后继引用它。
 * 模型取「追加顺序中最后一个未被引用为父的条目」作 leaf——被弃条目必须
 * 出现在活动链**之前**，否则 leaf 会落到它身上。
 */
function abandonedBranch(turn: MockTurn, active: SessionEntry[]): SessionEntry[] {
  const fork = active.find(
    (entry) => entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant",
  );
  if (!fork) return [];
  const abandoned: SessionEntry[] = [];
  let parentId = fork.id;
  for (let i = 0; i < (turn.abandoned ?? 0); i++) {
    const id = `${turn.id}-x${i}`;
    abandoned.push({
      type: "message",
      id,
      parentId,
      timestamp: turn.at ?? TS,
      message: { role: "assistant", content: [{ type: "text", text: `被弃分支的第 ${i + 1} 次尝试` }] },
    } as SessionEntry);
    parentId = id;
  }
  return abandoned;
}

const block = (from: MockSegment): ContentBlock | undefined => {
  if (from.kind === "thinking") return { type: "thinking", thinking: from.text };
  if (from.kind === "text") return { type: "text", text: from.text };
  return undefined;
};

/** 把一段 mock 展开成合法的 Entry 链（id / parentId 逐条相接，与 kernel 落盘形态一致） */
export function mockEntriesFor(turn: MockTurn): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const at = turn.at ?? TS;
  const base = Date.parse(at);
  let parentId: string | null = null;
  let seq = 0;

  /** 条目按序推进时间戳，让 Recap 的耗时真实可算（模型层只做末减首） */
  const stamp = () =>
    new Date(base + Math.round(((turn.elapsedMs ?? 0) * seq) / Math.max(turn.segments.length, 1))).toISOString();

  const push = (entry: Omit<SessionEntry, "parentId" | "timestamp"> & { id: string }) => {
    entries.push({ ...entry, parentId, timestamp: stamp() } as SessionEntry);
    parentId = entry.id;
  };

  if (turn.user) {
    push({
      type: "message",
      id: `${turn.id}-u`,
      message: { role: "user", content: turn.user },
    } as never);
  }

  // 被弃分支：从首条 assistant 分叉，插入在活动链**之前**（否则它会成为 leaf）。
  // 活动链随后也从同一条 assistant 继续，于是被弃链无人引用，只有活动链尾是 leaf。
  let forkInjected = false;

  for (const segment of turn.segments) {
    seq += 1;
    const id = `${turn.id}-s${seq}`;

    if (segment.kind === "thinking" || segment.kind === "text") {
      const content = block(segment);
      if (!content) continue;
      push({
        type: "message",
        id,
        message: { role: "assistant", content: [content] },
      } as never);
      // 首条 assistant 落盘后立刻插入被弃分支（parentId 指向它）
      if (!forkInjected && turn.abandoned) {
        forkInjected = true;
        entries.push(...abandonedBranch(turn, entries));
      }
      continue;
    }

    const tool = segment.tool;

    if (tool.state === "stopped") {
      // pi 的取消只落一条 bashExecution（cancelled），**不产生 toolCall**——
      // 若同时给 toolCall 而它没有配对结果，模型会（正确地）判定为 running。
      push({
        type: "message",
        id: `${id}-b`,
        message: {
          role: "bashExecution",
          command: String(tool.args?.command ?? tool.name),
          output: tool.output,
          cancelled: true,
        },
      } as never);
      continue;
    }

    const callId = `${id}-call`;
    push({
      type: "message",
      id,
      message: { role: "assistant", content: [{ type: "toolCall", id: callId, name: tool.name, arguments: tool.args }] },
    } as never);

    if (tool.state !== "running") {
      const details: Record<string, unknown> = {};
      if (tool.diff) details.diff = tool.diff;
      if (tool.patch) details.patch = tool.patch;
      if (tool.calls) details.calls = tool.calls;
      push({
        type: "message",
        id: `${id}-r`,
        message: {
          role: "toolResult",
          toolCallId: callId,
          toolName: tool.name,
          content: tool.output ? [{ type: "text", text: tool.output }] : [],
          details: Object.keys(details).length > 0 ? details : undefined,
          isError: tool.state === "error",
        },
      } as never);
    }
    // state === "running"：只有 toolCall、无配对结果——模型层据此判定为 running
  }

  // tokens 挂到最后一条 assistant 的 usage 上（pi 形状；模型层累加 totalTokens）
  if (turn.tokens !== undefined) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant") {
        const message = (entry as { message: Record<string, unknown> }).message;
        message.usage = { totalTokens: turn.tokens };
        break;
      }
    }
  }

  // 中止/错误挂在最后一条 assistant 上（pi 的 stopReason 语义）
  if (turn.warning) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant") {
        const message = (entry as { message: Record<string, unknown> }).message;
        message.stopReason = turn.warning.kind === "aborted" ? "aborted" : "error";
        if (turn.warning.kind === "error") message.errorMessage = "1 test failed";
        break;
      }
    }
  }

  if (turn.compaction) {
    push({ type: "compaction", id: `${turn.id}-c`, tokensBefore: 128000 } as never);
  }

  return entries;
}

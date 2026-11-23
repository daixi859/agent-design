/**
 * Agent 高保真页 mock 数据：只负责内容，不持有任何组件或样式假设。
 * 字段命名贴近现有 app 的领域词（Session / Run / Tool / Turn），便于日后换真数据。
 */

export type SessionState = "running" | "done" | "paused" | "failed";

export interface SessionMock {
  id: string;
  title: string;
  project: string;
  when: string;
  state: SessionState;
  branch?: boolean;
  unread?: number;
}

export const sessionGroups: { label: string; items: SessionMock[] }[] = [
  {
    label: "今天",
    items: [
      { id: "r07", title: "修复 webhook 重试的幂等性", project: "northstar/billing", when: "现在", state: "running", unread: 2 },
      { id: "r06", title: "账户设置迁移到新令牌层", project: "northstar/web", when: "12:08", state: "done" },
      { id: "r05", title: "排查构建缓存失效", project: "northstar/infra", when: "09:41", state: "failed", branch: true },
    ],
  },
  {
    label: "昨天",
    items: [
      { id: "r04", title: "给结算任务补回归测试", project: "northstar/billing", when: "18:20", state: "done" },
      { id: "r03", title: "重构上传分片逻辑", project: "northstar/files", when: "15:02", state: "paused", branch: true },
    ],
  },
  {
    label: "过去 7 天",
    items: [
      { id: "r02", title: "接入审计日志", project: "northstar/api", when: "周三", state: "done" },
    ],
  },
];

export const searchHits = [
  { file: "src/webhooks/handler.ts", line: 42, text: 'const key = req.header("idempotency-key") ?? randomUUID()' },
  { file: "src/webhooks/retry.ts", line: 18, text: 'backoff.retry(dispatch, { attempts: 4 })' },
  { file: "test/webhooks/retry.spec.ts", line: 7, text: 'describe("retry keeps a stable idempotency key", ...)' },
];

export const codeExcerpt = [
  { n: 38, text: "export async function handleWebhook(req: Request) {" },
  { n: 39, text: "  const event = parseEvent(req.body)" },
  { n: 40, text: '  const attempt = Number(req.header("x-retry-attempt") ?? 0)' },
  { n: 41, text: "" },
  { n: 42, text: '  const key = req.header("idempotency-key") ?? randomUUID()', hot: true },
  { n: 43, text: "  await dispatch(event, { key, attempt })" },
  { n: 44, text: "" },
  { n: 45, text: "  if (attempt > 0) {" },
  { n: 46, text: '    metrics.increment("webhook.retried")' },
  { n: 47, text: "  }" },
  { n: 48, text: "" },
  { n: 49, text: '  await respond(event.id, { status: "ok" })' },
  { n: 50, text: "}" },
];

export const diffLines = [
  " const event = parseEvent(req.body)",
  '-const key = req.header("idempotency-key") ?? randomUUID()',
  "-await dispatch(event, { key, attempt })",
  '+const key = req.header("idempotency-key") ?? event.id',
  "+await seen.once(key, () => dispatch(event, { key, attempt }))",
];

export const testLines: { text: string; tone?: "pass" | "muted" | "strong" }[] = [
  { text: "$ pnpm test webhooks", tone: "muted" },
  { text: "✓ 幂等键在重试之间保持稳定", tone: "pass" },
  { text: "✓ 重复事件只派发一次", tone: "pass" },
  { text: "✓ 缺少幂等键时回退到事件 ID", tone: "pass" },
  { text: "12 passed · 0 failed    1.8s", tone: "strong" },
];

export const liveLines = [
  { text: "> @northstar/billing-api test", done: true },
  { text: "> vitest run --filter webhooks", done: true },
  { text: "", done: true },
  { text: "✓ test/webhooks/retry.spec.ts  (12 tests)  0.9s", done: true },
  { text: "✓ test/webhooks/handler.spec.ts  (8 tests)  0.4s", done: true },
  { text: "▸ test/ledger/writer.spec.ts  (6 tests)", done: false },
];

export const planSteps = [
  { label: "梳理 webhook 重试链路", done: true },
  { label: "定位幂等键生成位置", done: true },
  { label: "补重复事件回归测试", done: true },
  { label: "全量测试验证", done: false },
];

export const changedFiles = [
  { status: "M", file: "src/webhooks/handler.ts", added: 2, removed: 2 },
  { status: "M", file: "test/webhooks/retry.spec.ts", added: 24, removed: 0 },
  { status: "A", file: "test/fixtures/duplicate-event.json", added: 18, removed: 0 },
];

export const activityItems = [
  { time: "12:41", text: "开始运行 · run 07", state: "done" },
  { time: "12:43", text: "定位到 handler.ts:42", state: "done" },
  { time: "12:46", text: "写入 1 处改动", state: "done" },
  { time: "12:47", text: "局部测试通过", state: "done" },
  { time: "12:48", text: "全量测试运行中", state: "live" },
];

export const contextBreakdown = [
  { label: "输入", value: 4.8, token: "--color-context-breakdown-1" },
  { label: "工具输出", value: 18.6, token: "--color-context-breakdown-2" },
  { label: "思考", value: 6.1, token: "--color-context-breakdown-3" },
  { label: "系统", value: 4.7, token: "--color-context-breakdown-4" },
];

export const queueSeed = [
  "顺便检查一下 retry.ts 里的退避上限",
  "最后给我一段改动摘要",
];

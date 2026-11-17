// 真 pi SDK 适配器：把 AgentSession 包装成 PiSessionLike（ADR-0012）。
// 薄层不单测（fake 已覆盖宿主语义），由阶段四真内核冒烟兜底。
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type { PiSessionLike, PiSessionRequest } from "./types.ts";

/**
 * 注入与 pi CLI 相同的内置扩展（codemode / tool-search / mcp）。
 * SDK 会话默认不带 builtInExtensions：不注入则 defaultTools 里的 +codemode
 * 解析到未注册的工具名，静默无效（ADR-0012 补记五；
 * 修复路线实证见 docs/research/pi-kernel-notes.md §5.4）。
 */
async function createPiResourceLoader(cwd: string) {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    // settings 的 defaultTools 已含 +codemode / +tool_search，工厂注册后即激活
    extensionFactories: [createCodemodeExtension(), createToolSearchExtension(), createMcpExtension()],
  });
  await loader.reload();
  return loader;
}

/** 按请求打开真实内核会话：attach = open(file)；create = 在 cwd 新建持久会话 */
export async function openPiSession(request: PiSessionRequest): Promise<PiSessionLike> {
  const sessionManager =
    request.kind === "attach" ? SessionManager.open(request.file) : SessionManager.create(request.cwd);
  const resourceLoader = await createPiResourceLoader(sessionManager.getCwd());
  const { session } = await createAgentSession({ sessionManager, resourceLoader });
  // session_start 触发扩展初始化（含 MCP 服务器后台连接），与 CLI 启动时序对齐
  await session.bindExtensions({});
  return adaptAgentSession(session);
}

function adaptAgentSession(session: AgentSession): PiSessionLike {
  // 已推送条目的水位：pi 的 entry_appended 不覆盖普通消息落盘，
  // 故由宿主在消息 / 轮次边界拉取条目树的新增尾部（条目只追加，计数即水位）
  // 水位按条目数走：getEntryCount() 是 Map.size（无复制），
  // 而 getEntries() 每次都会 filter 复制整个会话数组（上游也为此专门加了注释）
  let flushedCount = session.sessionManager.getEntryCount();
  return {
    get sessionId() {
      return session.sessionId;
    },
    snapshot() {
      const entries = session.sessionManager.getEntries() as unknown as SessionEntry[];
      const header = session.sessionManager.getHeader() as unknown as SessionHeaderEntry | null;
      return header ? { header, entries } : { entries };
    },
    subscribe(listener) {
      return session.subscribe(listener);
    },
    // PromptOptions 是 pi PromptOptions 的窄投影，结构兼容，直接透传
    prompt: (text, options) => session.prompt(text, options),
    steer: (text) => session.steer(text),
    followUp: (text) => session.followUp(text),
    abort: () => session.abort(),
    drainNewEntries(): SessionEntry[] {
      // 计数先比：无新条目时根本不复制（驱动中每轮要问好几次）
      const count = session.sessionManager.getEntryCount();
      if (count <= flushedCount) return [];
      const fresh = session.sessionManager.getEntries().slice(flushedCount) as unknown as SessionEntry[];
      flushedCount = count;
      return fresh;
    },
    dispose: () => session.dispose(),
  };
}

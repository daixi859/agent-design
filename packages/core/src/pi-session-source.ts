// 真 pi SDK 适配器：把 AgentSession 包装成 PiSessionLike（ADR-0012）。
// 薄层不单测（fake 已覆盖宿主语义），由阶段四真内核冒烟兜底。
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type {
  CommandCatalogItem,
  ContextUsageInfo,
  GlobalCatalog,
  ModelCatalog,
  ModelCatalogEntry,
  SessionCatalog,
} from "@pi-studio/shared/protocol";
import {
  modelEntryOf,
  promptCommandOf,
  providerNameOf,
  skillCommandOf,
  thinkingLevelsOf,
  type KernelModelLike,
} from "./catalog-map.ts";
import { globalCommandEntries, globalModelEntries } from "./global-catalog.ts";
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

// ===== 目录映射（ADR-0016）：条目级映射抽至 catalog-map（会话/全局两路共用，已测） =====

/** 命令目录（ADR-0016）：扩展命令（冲突时内核已解析出 invocationName）+ prompt 模板 + skills。
 *  三类的触发文本都走内核 prompt() 的解释形态，客户端原样透传；模板与 skills 走
 *  catalog-map 共享映射（全局投影同源） */
function buildCommandCatalog(session: AgentSession): CommandCatalogItem[] {
  const items: CommandCatalogItem[] = [];
  let extensionCommands: ReturnType<typeof session.extensionRunner.getRegisteredCommands> = [];
  try {
    extensionCommands = session.extensionRunner.getRegisteredCommands();
  } catch {
    // 扩展运行器不可用（理论不可达）：命令目录退化为空，不挡模型目录
  }
  for (const command of extensionCommands) {
    const name = command.invocationName || command.name;
    items.push({
      name,
      trigger: `/${name}`,
      ...(command.description ? { description: command.description } : {}),
      source: "extension",
    });
  }
  for (const template of session.promptTemplates) {
    items.push(promptCommandOf(template));
  }
  for (const skill of session.resourceLoader.getSkills().skills) {
    items.push(skillCommandOf(skill));
  }
  return items;
}

function buildModelCatalog(session: AgentSession): ModelCatalog {
  const runtime = session.modelRuntime;
  const current = session.model;
  // 目录只列已添加的服务商（ADR-0016 补记）：getAllModels 是 models.dev 全集，
  // 未配置凭据的服务商既切不过去（getModel 查凭据即 throw）也不该入眼；
  // 当前模型始终保留（会话正跑在它上面，不因凭据判定时序而消失）
  const isConfigured = (provider: string) =>
    current?.provider === provider || runtime.hasConfiguredAuth(provider);
  const models: ModelCatalogEntry[] = (runtime.getAllModels() as readonly KernelModelLike[])
    .filter((model) => isConfigured(model.provider))
    .map((model) => {
      const isCurrent = current !== undefined && model.provider === current.provider && model.id === current.id;
      // 当前模型的档位以内核权威口径为准（getAvailableThinkingLevels 已按模型 clamp）
      const thinkingLevels = isCurrent
        ? session.getAvailableThinkingLevels()
        : thinkingLevelsOf(model);
      return modelEntryOf(model, thinkingLevels, providerNameOf(runtime, model.provider));
    });
  return {
    models,
    ...(current ? { current: { provider: current.provider, modelId: current.id } } : {}),
    ...(session.thinkingLevel ? { thinkingLevel: session.thinkingLevel } : {}),
  };
}

// ===== 全局目录（补记十四/十五）：浏览态 Model Seat 与 Trigger Menu 的 REST 兜底 =====

/** 全局目录（GET /api/catalog）：每请求新建 runtime 与 resource loader——读本地
    auth/models/skills/prompts 快照（allowModelNetwork 默认关，无网络刷新），与
    createAgentSession 未传 agentDir 的会话装配同源同滤；单例缓存会漏掉运行期新增的
    服务商与命令，而本端点每页加载至多被取一次（客户端模块级 memo），新建成本可忽略。
    命令目录以 server 进程 cwd 解析（与 pi CLI 同目录启动同源；会话属其它项目时以
    该会话缓存目录为准，本投影只兜首次浏览的底）。映射走 globalModelEntries /
    globalCommandEntries（已测）。 */
export async function globalCatalog(): Promise<GlobalCatalog> {
  const runtime = await ModelRuntime.create();
  const loader = await createPiResourceLoader(process.cwd());
  return { model: { models: globalModelEntries(runtime) }, commands: globalCommandEntries(loader) };
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
    catalog(): SessionCatalog {
      return { model: buildModelCatalog(session), commands: buildCommandCatalog(session) };
    },
    // 协议只给 (provider, modelId)，内核收完整 Model 对象：经 modelRuntime 查表还原；
    // 查无此模型或未配凭据时 throw，宿主不吞（server 转为 commandFailed 帧）
    async setModel(provider, modelId) {
      const model = session.modelRuntime.getModel(provider, modelId);
      if (!model) throw new Error(`未知模型：${provider}/${modelId}`);
      // 不带 persist：仅会话级（ADR-0017），内核随后自行 clamp thinking 档位
      await session.setModel(model);
    },
    setThinkingLevel(level) {
      session.setThinkingLevel(level as Parameters<AgentSession["setThinkingLevel"]>[0]);
      return Promise.resolve();
    },
    clearQueue: () => {
      session.clearQueue();
    },
    compact: async () => {
      await session.compact();
    },
    contextUsage(): ContextUsageInfo | undefined {
      const usage = session.getContextUsage();
      // 内核 ContextUsage 与协议 ContextUsageInfo 同构（tokens 可为 null：刚压缩完未知）
      return usage ? { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent } : undefined;
    },
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

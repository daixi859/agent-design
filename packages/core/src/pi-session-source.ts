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
import { THINKING_LEVEL_ORDER } from "@pi-studio/shared/protocol";
import type {
  CommandCatalogItem,
  ContextUsageInfo,
  ModelCatalog,
  ModelCatalogEntry,
  SessionCatalog,
} from "@pi-studio/shared/protocol";
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

// ===== 目录映射（ADR-0016）：内核形状 → 协议形状，唯一映射点 =====

/** 目录所需的内核模型字段子集（pi-ai Model 的窄投影，结构化收窄替代 any） */
interface KernelModelLike {
  id: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  /** 键为 thinking 档位名（off/minimal/.../max）的映射表 */
  thinkingLevelMap?: unknown;
}

/** 单个模型的可用档位：内核给过 thinkingLevelMap 就取键（按正典序），
 *  未给则按 reasoning 推导——setThinkingLevel 内核还会再 clamp，此处宁全勿缺 */
function thinkingLevelsOf(model: KernelModelLike): string[] {
  const map = model.thinkingLevelMap;
  if (map && typeof map === "object") {
    const keys = Object.keys(map).filter((key) => key.length > 0);
    if (keys.length > 0) {
      return keys.sort(
        (a, b) =>
          THINKING_LEVEL_ORDER.indexOf(a as (typeof THINKING_LEVEL_ORDER)[number]) -
          THINKING_LEVEL_ORDER.indexOf(b as (typeof THINKING_LEVEL_ORDER)[number]),
      );
    }
  }
  return model.reasoning === false ? ["off"] : [...THINKING_LEVEL_ORDER];
}

/** 命令目录（ADR-0016）：扩展命令（冲突时内核已解析出 invocationName）+ prompt 模板 + skills。
 *  三类的触发文本都走内核 prompt() 的解释形态，客户端原样透传 */
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
    items.push({
      name: template.name,
      trigger: `/${template.name}`,
      ...(template.description ? { description: template.description } : {}),
      ...(template.argumentHint ? { argumentHint: template.argumentHint } : {}),
      source: "prompt",
    });
  }
  for (const skill of session.resourceLoader.getSkills().skills) {
    items.push({
      name: skill.name,
      trigger: `/skill:${skill.name}`,
      ...(skill.description ? { description: skill.description } : {}),
      source: "skill",
    });
  }
  return items;
}

function buildModelCatalog(session: AgentSession): ModelCatalog {
  const runtime = session.modelRuntime;
  const current = session.model;
  const models: ModelCatalogEntry[] = (runtime.getAllModels() as readonly KernelModelLike[]).map((model) => {
    const isCurrent = current !== undefined && model.provider === current.provider && model.id === current.id;
    // 当前模型的档位以内核权威口径为准（getAvailableThinkingLevels 已按模型 clamp）
    const thinkingLevels = isCurrent
      ? session.getAvailableThinkingLevels()
      : thinkingLevelsOf(model);
    return {
      provider: model.provider,
      modelId: model.id,
      ...(model.name && model.name !== model.id ? { name: model.name } : {}),
      thinkingLevels,
      ...(typeof model.contextWindow === "number" ? { contextWindow: model.contextWindow } : {}),
    };
  });
  return {
    models,
    ...(current ? { current: { provider: current.provider, modelId: current.id } } : {}),
    ...(session.thinkingLevel ? { thinkingLevel: session.thinkingLevel } : {}),
  };
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

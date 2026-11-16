// 真 pi SDK 适配器：把 AgentSession 包装成 PiSessionLike（ADR-0012）。
// 薄层不单测（fake 已覆盖宿主语义），由阶段四真内核冒烟兜底。
import { createAgentSession, SessionManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionHeaderEntry } from "@pi-studio/shared/pi-types";
import type { PiSessionLike, PiSessionRequest } from "./types.ts";

/** 按请求打开真实内核会话：attach = open(file)；create = 在 cwd 新建持久会话 */
export async function openPiSession(request: PiSessionRequest): Promise<PiSessionLike> {
  const sessionManager =
    request.kind === "attach" ? SessionManager.open(request.file) : SessionManager.create(request.cwd);
  const { session } = await createAgentSession({ sessionManager });
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

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
  // 故由宿主在轮次边界拉取条目树的新增尾部（条目只追加，长度即水位）
  let flushedCount = session.sessionManager.getEntries().length;
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
    prompt: (text) => session.prompt(text),
    steer: (text) => session.steer(text),
    followUp: (text) => session.followUp(text),
    abort: () => session.abort(),
    drainNewEntries(): SessionEntry[] {
      const entries = session.sessionManager.getEntries();
      if (entries.length <= flushedCount) return [];
      const fresh = entries.slice(flushedCount) as unknown as SessionEntry[];
      flushedCount = entries.length;
      return fresh;
    },
    dispose: () => session.dispose(),
  };
}

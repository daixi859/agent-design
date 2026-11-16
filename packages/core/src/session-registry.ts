// SessionRegistry：多 Session 并存的属主表（ADR-0012）。
// 内存属主标记是唯一互斥手段（进程消亡即释放，对 pi CLI 仅 best-effort）：
// 文件级标记防同一 JSONL 被重开双写，sessionId 级标记防事件流串流。
import type { DriveEvent } from "@pi-studio/shared/protocol";
import { SessionHost } from "./session-host.ts";
import type { PiSessionFactory, PiSessionRequest } from "./types.ts";

interface Registration {
  host: SessionHost;
  /** attach 而来的文件路径；create 为 undefined */
  file?: string;
}

export class SessionRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly factory: PiSessionFactory;
  private readonly emit: (event: DriveEvent) => void;

  constructor(factory: PiSessionFactory, emit: (event: DriveEvent) => void) {
    this.factory = factory;
    this.emit = emit;
  }

  /** 接管已有 session（GLOSSARY: Attach） */
  attach(file: string): Promise<SessionHost> {
    return this.open({ kind: "attach", file });
  }

  /** 在真实项目 cwd 新建 session（GLOSSARY: Drive） */
  create(cwd: string): Promise<SessionHost> {
    return this.open({ kind: "create", cwd });
  }

  get(sessionId: string): SessionHost | undefined {
    return this.registrations.get(sessionId)?.host;
  }

  isDriven(sessionId: string): boolean {
    return this.registrations.has(sessionId);
  }

  isFileDriven(file: string): boolean {
    for (const reg of this.registrations.values()) {
      if (reg.file === file) return true;
    }
    return false;
  }

  /** 释放单个会话并撤标记；未知 id 静默 */
  release(sessionId: string): void {
    const reg = this.registrations.get(sessionId);
    if (!reg) return;
    reg.host.dispose();
    this.registrations.delete(sessionId);
  }

  disposeAll(): void {
    for (const reg of this.registrations.values()) reg.host.dispose();
    this.registrations.clear();
  }

  private async open(request: PiSessionRequest): Promise<SessionHost> {
    const file = request.kind === "attach" ? request.file : undefined;
    if (file && this.isFileDriven(file)) {
      throw new Error(`session 已被驱动，拒绝重开：${file}`);
    }
    const session = await this.factory(request);
    if (this.registrations.has(session.sessionId)) {
      session.dispose();
      throw new Error(`sessionId 冲突，拒绝登记：${session.sessionId}`);
    }
    const host = new SessionHost({ session, emit: this.emit });
    this.registrations.set(host.sessionId, { host, file });
    return host;
  }
}

// SessionRegistry：多 Session 并存的属主表（ADR-0012）。
// 内存属主标记随**连接**消亡即释放（对 pi CLI 仅 best-effort）。互斥只按 sessionId：
// 同一 session 重复登记是 bug，故拒绝；同一 JSONL 的重复 attach 由 gateway 的
// 单客户端租约 + 幂等重放挡在前面（ADR-0012 补记十六），此处不再单独设文件级闸门。
import type { DriveErrorCode, DriveEvent } from "@pi-studio/shared/protocol";
import { SessionHost } from "./session-host.ts";
import type { PiSessionFactory, PiSessionRequest } from "./types.ts";

/** 属主表错误：文案与机器码分离，客户端按 code 走 i18n（ADR-0011） */
export class RegistryError extends Error {
  readonly code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

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

  /** 按 attach 文件查已登记的 sessionId（gateway 的重放幂等判定用） */
  sessionOf(file: string): string | undefined {
    for (const [sessionId, reg] of this.registrations) {
      if (reg.file === file) return sessionId;
    }
    return undefined;
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
    const session = await this.factory(request);
    if (this.registrations.has(session.sessionId)) {
      session.dispose();
      throw new RegistryError("sessionConflict", `sessionId 冲突，拒绝登记：${session.sessionId}`);
    }
    const host = new SessionHost({ session, emit: this.emit });
    this.registrations.set(host.sessionId, { host, file });
    return host;
  }
}

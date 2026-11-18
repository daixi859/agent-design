// SessionRegistry：多 Session 并存的属主表（ADR-0012；C7 属主单表收敛）。
// 内存属主标记是唯一互斥手段（**连接**消亡即释放，对 pi CLI 仅 best-effort）：
// 文件级标记防同一 JSONL 被重开双写，sessionId 级标记防事件流串流。
// 属主身份住本表（owner token = 传输连接的透明对象），gateway 只投喂心跳存活——
// 「属主 = 连接」一个概念一处记账，僵尸接管与迟到 close 的守卫由单表结构性保证。
import type { DriveErrorCode, DriveEvent } from "@pi-studio/shared/protocol";
import { SessionHost } from "./session-host.ts";
import type { PiSessionFactory, PiSessionRequest } from "./types.ts";

/** 属主身份（C7）：传输层连接的透明令牌——只要求对象身份，不感知传输类型
 *  （WS socket / 未来 IPC 端口），registry 仅做同一性比较与存活投喂 */
export type OwnerToken = object;

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
  /** 属主连接（单表记账的唯一真相源，C7） */
  owner: OwnerToken;
  /** 心跳存活（gateway 投喂）：close 迟到的僵尸按它判定接管 */
  alive: boolean;
}

export class SessionRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly factory: PiSessionFactory;
  private readonly emit: (event: DriveEvent) => void;

  constructor(factory: PiSessionFactory, emit: (event: DriveEvent) => void) {
    this.factory = factory;
    this.emit = emit;
  }

  /** 接管已有 session（GLOSSARY: Attach）；owner 即发起连接 */
  attach(file: string, owner: OwnerToken): Promise<SessionHost> {
    return this.open({ kind: "attach", file }, owner);
  }

  /** 在真实项目 cwd 新建 session（GLOSSARY: Drive）；owner 即发起连接 */
  create(cwd: string, owner: OwnerToken): Promise<SessionHost> {
    return this.open({ kind: "create", cwd }, owner);
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

  /** 会话的属主连接（gateway 的幂等重放判定用；未驱动回 undefined） */
  ownerOf(sessionId: string): OwnerToken | undefined {
    return this.registrations.get(sessionId)?.owner;
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

  /** 该属主是否仍有存活登记（gateway 的僵尸判定传感器读数） */
  isOwnerAlive(owner: OwnerToken): boolean {
    for (const reg of this.registrations.values()) {
      if (reg.owner === owner && reg.alive) return true;
    }
    return false;
  }

  /** 心跳投喂（gateway ping 后）：该连接名下登记全部判活 */
  markAlive(owner: OwnerToken): void {
    for (const reg of this.registrations.values()) {
      if (reg.owner === owner) reg.alive = true;
    }
  }

  /** 心跳投喂（gateway terminate 前）：该连接名下登记全部判死——其后他人 attach 即接管 */
  markDead(owner: OwnerToken): void {
    for (const reg of this.registrations.values()) {
      if (reg.owner === owner) reg.alive = false;
    }
  }

  /** 连接消亡（close / terminate 后）：释放该属主名下全部会话，返回释放的 sessionId。
   *  新属主接管后登记的 owner 已换人——本方法天然不触及，迟到 close 的守卫是结构性的。 */
  releaseByOwner(owner: OwnerToken): string[] {
    const released: string[] = [];
    for (const [sessionId, reg] of this.registrations) {
      if (reg.owner === owner) {
        reg.host.dispose();
        this.registrations.delete(sessionId);
        released.push(sessionId);
      }
    }
    return released;
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

  private async open(request: PiSessionRequest, owner: OwnerToken): Promise<SessionHost> {
    const file = request.kind === "attach" ? request.file : undefined;
    if (file) {
      const existing = this.sessionOf(file);
      if (existing !== undefined) {
        const reg = this.registrations.get(existing)!;
        if (reg.owner === owner) {
          // 同连接重放被 gateway 幂等拦截，到达此处属异常流；拒绝重开而非静默复用
          throw new RegistryError("sessionConflict", `同连接重复 attach，拒绝重开：${file}`);
        }
        if (reg.alive) {
          throw new RegistryError("sessionAlreadyDriven", `session 已被驱动，拒绝重开：${file}`);
        }
        // 僵尸属主（close 迟到、心跳已判死）：释放旧宿主后由本次 attach 接管
        this.release(existing);
      }
    }
    const session = await this.factory(request);
    if (this.registrations.has(session.sessionId)) {
      session.dispose();
      throw new RegistryError("sessionConflict", `sessionId 冲突，拒绝登记：${session.sessionId}`);
    }
    const host = new SessionHost({ session, emit: this.emit });
    this.registrations.set(host.sessionId, { host, file, owner, alive: true });
    return host;
  }
}

// inflight 在途簿记：一条消息 / 一次新建在 attach 空窗内的唯一账本（ADR-0012 补记十一）。
// 原状是两套平行簿记（pendingSends 按 file 键、pendingCreates FIFO）加四个 fail 函数
// 三胞胎；本模块把登记与兑付收拢为一处。纪律：兑付一律「取出并返回」，副作用
// （撤乐观壳、发帧）由调用方执行——账本只管登记与出账，不碰 store、不持连接。
import { inflightFileOf, type ModelChoice } from "./drive-client";

/** 懒发送的待补发条目（GLOSSARY Send-to-Attach）：首条乐观注册时入列，attach 在途的
 *  后续发送追加；携浏览态的选择挂起（补记十二），attached 回包到达即按序兑付 */
export interface InflightSend {
  readonly sessionId: string;
  readonly texts: string[];
  choice?: ModelChoice;
}

/** create 新建的待定应答（create 无 file，靠 attached/error 帧兑付；断线也要兑付） */
interface CreateTicket {
  resolve: (sessionId: string) => void;
  reject: (err: Error) => void;
}

/** create 的兑付结果：成功带 attached 回包的 sessionId，失败带可展示的原始消息 */
export type CreateOutcome = { ok: true; sessionId: string } | { ok: false; message: string };

export class InflightBook {
  /** file → 待补发序列；file 是权威键（error 帧按它回显精确兑付） */
  private sends = new Map<string, InflightSend>();
  /** create 待定应答（FIFO）：同一时刻至多一个新建在途，帧序即兑付序 */
  private creates: CreateTicket[] = [];

  // —— 懒发送（file 键）——

  registerSend(file: string, send: InflightSend): void {
    this.sends.set(file, send);
  }

  /** attach 在途的后续发送：追加文本并 merge 最新挂起选择（兑付以最新选择为准） */
  appendSend(file: string, text: string, choice?: ModelChoice): InflightSend {
    const send = this.sends.get(file)!;
    send.texts.push(text);
    if (choice) send.choice = { ...send.choice, ...choice };
    return send;
  }

  sendOf(file: string): InflightSend | undefined {
    return this.sends.get(file);
  }

  /** attach 在途定位（判定谓词在 drive-client，已测）：先按 file 直查（懒接管首条，
   *  调用方还带着 file），再按 sessionId 反查（乐观注册后调用方只剩 sessionId） */
  fileFor(sessionId: string, file?: string): string | undefined {
    return inflightFileOf(this.sends, sessionId, file);
  }

  /** 重连重放与退避重试的 known 集合的在途半边（另一半是已登记 file 表） */
  sendFiles(): IterableIterator<string> {
    return this.sends.keys();
  }

  get sendCount(): number {
    return this.sends.size;
  }

  /** 兑付成功（attached 回包）：取出待补发条目，调用方按序发帧；未知 file 返回 undefined */
  consumeSend(file: string): InflightSend | undefined {
    const send = this.sends.get(file);
    if (send) this.sends.delete(file);
    return send;
  }

  /** 兑付失败（attach 被拒，error 帧携 file 回显）：取出条目，调用方撤乐观壳 */
  dropSend(file: string): InflightSend | undefined {
    return this.consumeSend(file);
  }

  /** 兑付全部失败（重试窗耗尽）：清账本，返回待撤乐观壳的 sessionId 列表 */
  dropAllSends(): string[] {
    const ids = [...this.sends.values()].map((send) => send.sessionId);
    this.sends.clear();
    return ids;
  }

  /** 用户解除：撤该会话的在途懒发送（attached 回包不得再补发 prompt） */
  dropSendsForSession(sessionId: string): void {
    for (const [file, send] of this.sends) {
      if (send.sessionId === sessionId) this.sends.delete(file);
    }
  }

  // —— create 待定应答（FIFO）——

  registerCreate(resolve: (sessionId: string) => void, reject: (err: Error) => void): void {
    this.creates.push({ resolve, reject });
  }

  /** 帧到达即兑付队首；空账本静默（迟到帧） */
  settleCreate(outcome: CreateOutcome): void {
    const ticket = this.creates.shift();
    if (!ticket) return;
    if (outcome.ok) ticket.resolve(outcome.sessionId);
    else ticket.reject(new Error(outcome.message));
  }

  /** 连接断开：全部待定 create 立即失败，调用方的 .then 不悬挂；
   *  懒发送不受影响——乐观回显顶住断线窗口，重连重放后续发 */
  failAllCreates(message: string): void {
    for (const ticket of this.creates.splice(0)) ticket.reject(new Error(message));
  }
}

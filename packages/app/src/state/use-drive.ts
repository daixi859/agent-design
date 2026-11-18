// DriveClient：浏览器侧驱动连接（ADR-0012 阶段四）。帧到状态的纯逻辑与判定谓词都在
// lib/（drive-client / catalog-cache / inflight，已测）；编排层（本文件）经两条注入缝
// 可测：socketFactory（真 WebSocket / 测试假 socket）与时钟（退避重连、重放定时）——
// 重连退避、attach 竞态、在途兑付从此穿过接口测，不再只测纯归约。
// 连接管理：断线指数退避重连；重连后按 file 表 re-attach（create 出的会话无 file，
// 由附着回包的快照支撑渲染，断线后从侧栏重新接管）。
// 状态壳（ADR-0015）：会话快照表与连接错误住 zustand vanilla store，React 端
// 经 useStore + selector 取切片（组件级更新）；本类只管 WS 生命周期与状态归约。
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  applyServerFrame,
  cacheableCatalog,
  isBusyStatus,
  pendingSendCommands,
  type CachedCatalog,
  type DriveSession,
  type ModelChoice,
} from "../lib/drive-client";
import { InflightBook } from "../lib/inflight";
import { loadCachedCatalogs, persistCatalogs } from "../lib/catalog-cache";
import type { ClientFrame, DriveCommandBody, DriveErrorCode, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

// ===== 注入缝（两个适配器让接缝站得住）：生产用真 WebSocket 与全局定时器，测试注入假件 =====

/** 连接事件的回调面：DriveClient 只依赖这三个时点，不感知 WebSocket 本体 */
export interface DriveSocketHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

/** 连接适配器接口：ready = 帧可发（真 WS 即 readyState === OPEN） */
export interface DriveSocket {
  send(data: string): void;
  readonly ready: boolean;
}

export type SocketFactory = (handlers: DriveSocketHandlers) => DriveSocket;
export type Schedule = (fn: () => void, ms: number) => unknown;
export type CancelTimer = (handle: unknown) => void;

export interface DriveClientDeps {
  /** 缺省用真 WebSocket 连 `${location.host}/ws` */
  socketFactory?: SocketFactory;
  /** 缺省用全局 setTimeout（退避重连与重放共用） */
  schedule?: Schedule;
  cancel?: CancelTimer;
}

const browserSocketFactory: SocketFactory = (handlers) => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => handlers.onOpen();
  ws.onmessage = (message) => handlers.onMessage(String(message.data));
  ws.onclose = () => handlers.onClose();
  return {
    send: (data) => ws.send(data),
    get ready() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
};

/** 驱动状态切片：会话快照表 + 连接级错误（无 sessionId 归属）+ 浏览态缓存（补记十二） */
interface DriveState {
  sessions: ReadonlyMap<string, DriveSession>;
  connectionError: { message: string; code?: DriveErrorCode } | undefined;
  /** 浏览态 Model Seat 的目录缓存（补记十二）：sessionId → 最近一次 attached 的目录
      （只有 `model`/`commands` 切片，补记十五扩界）；release 不清（浏览态可选仍需菜单），
      刷新由 localStorage 续命，attach 覆盖刷新 */
  catalogs: ReadonlyMap<string, CachedCatalog>;
  /** 浏览态挂起的模型/档位选择（补记十二）：发送随懒发送兑付并清；不持久化（未发送的意图不承诺存活） */
  pendingChoices: ReadonlyMap<string, ModelChoice>;
  /** attach 在途的 sessionId 集合（C3）：inflight 账本的响应式镜像——账本是真相源
      （lib/inflight），镜像只服务订阅端（ComposerMode 的 attaching 判据） */
  attaching: ReadonlySet<string>;
}

export class DriveClient {
  /** 状态壳（ADR-0015）：UI 订阅端一律 useStore(drive.store, selector) 取切片 */
  readonly store = createStore<DriveState>(() => ({
    sessions: new Map(),
    connectionError: undefined,
    catalogs: new Map(),
    pendingChoices: new Map(),
    attaching: new Set(),
  }));
  /** sessionId → attach 时的 file（重连 re-attach 依据；create 会话不登记） */
  private files = new Map<string, string>();
  /** 在途簿记（lib/inflight，已测）：懒发送与 create 待定应答的唯一账本；
   *  兑付一律「取出并返回」，撤乐观壳、发帧等副作用由本类执行 */
  private readonly inflight = new InflightBook();
  private ws: DriveSocket | null = null;
  private reconnectTimer: unknown = null;
  private reconnectDelay = 500;
  /** 重连重放的来源标记与退避（2s→32s 五次）：重放被僵尸属主拒时按它静默重试——
      心跳宽免窗（服务端 2×heartbeat）内属主仍判「活」，重试窗须盖过 60s */
  private replayFiles = new Set<string>();
  private replayAttempts = 0;
  private replayTimer: unknown = null;
  private readonly socketFactory: SocketFactory | undefined;
  private readonly schedule: Schedule;
  private readonly cancel: CancelTimer;

  constructor(deps: DriveClientDeps = {}) {
    // 缺省用真 WebSocket；无浏览器全局且未注入（node 导入单例）时不连接——导入安全
    const browser = typeof WebSocket !== "undefined" && typeof location !== "undefined";
    this.socketFactory = deps.socketFactory ?? (browser ? browserSocketFactory : undefined);
    this.schedule = deps.schedule ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.cancel = deps.cancel ?? ((handle) => globalThis.clearTimeout(handle as number));
    this.connect();
  }

  private connect(): void {
    // node / 无浏览器全局且未注入适配器：模块级单例在测试环境导入必须安全，不连接
    if (this.socketFactory === undefined) return;
    if (this.reconnectTimer !== null) {
      this.cancel(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cancelReplay();
    this.ws = this.socketFactory({
      onOpen: () => {
        this.reconnectDelay = 500;
        // 重连后按 known file 集重放 attach（attached 幂等保留已有条目）；被拒走退避重试。
        // 懒发送的待接管 file 一并重放（attached 后按序补发，消息不丢）
        this.replayFiles = this.knownFiles();
        this.replayAttempts = 0;
        for (const file of this.replayFiles) {
          this.send({ type: "attach", file });
        }
      },
      onMessage: (data) => {
        this.handleFrame(JSON.parse(data) as ServerFrame);
      },
      onClose: () => {
        // 断线：待定的 create 立即失败，避免调用方永久悬挂。
        // 懒发送不失败：乐观回显顶住断线窗口，重连重放后补发（消息不丢）
        this.inflight.failAllCreates("驱动连接已断开");
        this.cancelReplay();
        this.reconnectTimer = this.schedule(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      },
    });
  }

  private cancelReplay(): void {
    if (this.replayTimer !== null) {
      this.cancel(this.replayTimer);
      this.replayTimer = null;
    }
  }

  /** 重连重放与退避重试的 known 集合：已登记 file + 懒发送在途 file */
  private knownFiles(): Set<string> {
    return new Set([...this.files.values(), ...this.inflight.sendFiles()]);
  }

  /** 重放被拒（sessionAlreadyDriven）的退避重试：只对 onopen 重放与懒发送 attach 生效
      （用户手点的 attach 已随驱动按钮退役）；file 表已清且待发送已兑付的条目不再重发 */
  private scheduleReplay(): void {
    if (this.replayTimer !== null) return;
    if (this.replayAttempts >= 5) {
      // 重试窗耗尽仍被拒：属主是活连接，落错误位交还给人；待发送一并兑付失败（回显让位）
      this.replayFiles.clear();
      this.failPendingSends();
      this.store.setState({
        connectionError: { message: "该会话正在被其它窗口驱动", code: "sessionAlreadyDriven" },
      });
      return;
    }
    const delay = Math.min(2000 * 2 ** this.replayAttempts, 32000);
    this.replayAttempts += 1;
    this.replayTimer = this.schedule(() => {
      this.replayTimer = null;
      const known = this.knownFiles();
      const pending = [...this.replayFiles].filter((file) => known.has(file));
      this.replayFiles = new Set(pending);
      for (const file of pending) {
        this.send({ type: "attach", file });
      }
    }, delay);
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.ready) this.ws.send(JSON.stringify(frame));
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.type === "error") {
      // 重连重放或懒发送 attach 撞上僵尸属主宽免窗：静默退避重试，不落错误位打断用户
      // （待发送的 file 并入重试集合；其乐观回显与 in-flight 登记都原地保留）
      if (frame.code === "sessionAlreadyDriven" && (this.replayFiles.size > 0 || this.inflight.sendCount > 0)) {
        for (const file of this.inflight.sendFiles()) this.replayFiles.add(file);
        this.scheduleReplay();
        return;
      }
      // attach 被拒（error 帧携 file 回显，ADR-0012 补记十一）：该 file 的待发送按序兑付
      // 失败——撤乐观会话、回显让位，错误条兜底；无 file 关联的连接级错误不撤待发送
      if (frame.file) this.failPendingSend(frame.file);
      // 连接级错误（attach/create 被拒、坏帧）：落错误位并兑付待定 create；
      // 错误文案走 i18n（服务端只给 code），无 code 时退回服务端原文
      this.store.setState({ connectionError: { message: frame.message, code: frame.code } });
      this.inflight.settleCreate({ ok: false, message: frame.message });
      return;
    }
    // 非错误帧到达即连接恢复：仅在错误位挂起时清位，避免同值通知
    if (this.store.getState().connectionError !== undefined) {
      this.store.setState({ connectionError: undefined });
    }
    switch (frame.type) {
      case "attached":
        if (frame.file) {
          this.files.set(frame.sessionId, frame.file);
          this.replayFiles.delete(frame.file);
          // 懒发送兑付：attach 成功即按序补发全部待发送 prompt——第一条新起一轮，
          // 后续由内核经 streamingBehavior "followUp" 排队（与 sendText 同口径）。
          // 乐观会话的 pendingPrompt 不动——它顶住到权威 user 条目回传（Pending Echo 语义不变）
          const pendingSend = this.inflight.consumeSend(frame.file);
          if (pendingSend) {
            this.mirrorAttaching([pendingSend.sessionId], []);
            // 兑付序（补记十二）：浏览态选择先 set 后 prompt——首轮即跑在新模型/档位上
            for (const outgoing of pendingSendCommands(frame.sessionId, pendingSend.texts, pendingSend.choice)) {
              this.send(outgoing);
            }
          }
        }
        // create 路径无 file：兑付待定的新建导航
        else this.inflight.settleCreate({ ok: true, sessionId: frame.sessionId });
        break;
      case "released": {
        const file = this.files.get(frame.sessionId);
        this.files.delete(frame.sessionId);
        if (file) this.replayFiles.delete(file);
        break;
      }
    }
    const sessionId = "event" in frame ? frame.event.sessionId : frame.sessionId;
    const current = this.store.getState().sessions.get(sessionId);
    const next = applyServerFrame(current, frame);
    // attached 的目录登记进浏览态缓存（补记十二）：归约幂等命中也不能省——缓存可能在
    // 会话条目零变化时首次/刷新（重 attach 无新条目但目录要覆盖续命）
    const cachedCatalog = frame.type === "attached" ? cacheableCatalog(frame.catalog) : undefined;
    if (next === current && !cachedCatalog) return;
    this.store.setState((state) => {
      const sessions = new Map(state.sessions);
      if (next) sessions.set(sessionId, next);
      else sessions.delete(sessionId);
      if (!cachedCatalog) return { sessions };
      return { sessions, catalogs: new Map(state.catalogs).set(sessionId, cachedCatalog) };
    });
  }

  /** 重试窗耗尽：全部待发送兑付失败——撤乐观会话（回显让位），错误条由调用方落 */
  private failPendingSends(): void {
    const ids = this.inflight.dropAllSends();
    this.dropOptimistic(ids);
    this.mirrorAttaching(ids, []);
  }

  /** 单个 file 的待发送兑付失败（attach 被拒，error 帧携 file 回显）：撤该 file 的
      乐观会话并清登记；未知 file 静默 */
  private failPendingSend(file: string): void {
    const pending = this.inflight.dropSend(file);
    if (!pending) return;
    this.dropOptimistic([pending.sessionId]);
    this.mirrorAttaching([pending.sessionId], []);
  }

  /** 撤乐观会话壳（懒发送兑付失败 / 用户解除的唯一落点）：in-flight 登记由调用方清，
      这里只管 sessions 切片；一次删除多个 id 时只建一次新 Map */
  private dropOptimistic(sessionIds: readonly string[]): void {
    this.store.setState((state) => {
      const present = sessionIds.filter((id) => state.sessions.has(id));
      if (present.length === 0) return state;
      const sessions = new Map(state.sessions);
      for (const id of present) sessions.delete(id);
      return { sessions };
    });
  }

  /** attach 在途镜像的同步点：账本（inflight）是真相源，这里只跟着记账——
      订阅端（ComposerMode 的 attaching 判据）据此重渲；无变化回原 state（避免同值通知） */
  private mirrorAttaching(remove: readonly string[], add: readonly string[]): void {
    this.store.setState((state) => {
      let changed = false;
      const next = new Set(state.attaching);
      for (const id of remove) {
        if (next.delete(id)) changed = true;
      }
      for (const id of add) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? { attaching: next } : state;
    });
  }

  // —— 对 UI 的命令面 ——

  /** 该 session 当前是否被驱动（Live Tail 停用判定、Composer 活性判定共用） */
  isDriven(sessionId: string): boolean {
    return this.store.getState().sessions.has(sessionId);
  }

  /** 该 session 是否有 attach 在途（C3）：ComposerMode 的 attaching 判据；
   *  响应式消费走 useDriveAttaching，这里供非响应的一次性取值 */
  isAttaching(sessionId: string): boolean {
    return this.store.getState().attaching.has(sessionId);
  }

  /** 非响应读取单个会话快照（effect 里的一次性取值；响应式消费走 useDriveSession） */
  session(sessionId: string): DriveSession | undefined {
    return this.store.getState().sessions.get(sessionId);
  }

  get connectionError(): { message: string; code?: DriveErrorCode } | undefined {
    return this.store.getState().connectionError;
  }

  /** 在项目 cwd 新建 session（GLOSSARY: Drive）；resolve 为 attached 帧带回的新 sessionId */
  create(cwd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.ws?.ready) {
        reject(new Error("驱动连接未就绪"));
        return;
      }
      this.inflight.registerCreate(resolve, reject);
      this.send({ type: "create", cwd });
    });
  }

  release(sessionId: string): void {
    // 懒发送在途的会话被解除：待发送一并撤（attached 回包不得再补发 prompt）
    this.inflight.dropSendsForSession(sessionId);
    this.mirrorAttaching([sessionId], []);
    this.files.delete(sessionId);
    this.dropOptimistic([sessionId]);
    this.send({ type: "release", sessionId });
  }

  /** 浏览态的模型/档位选择（补记十二）：merge 进挂起选择，UI 乐观显示；
      发送即随懒发送兑付并清（GLOSSARY Send-to-Attach 浏览态可选） */
  setPendingChoice(sessionId: string, choice: ModelChoice): void {
    this.store.setState((state) => ({
      pendingChoices: new Map(state.pendingChoices).set(sessionId, {
        ...state.pendingChoices.get(sessionId),
        ...choice,
      }),
    }));
  }

  /**
   * 语义化发送（ADR-0017 排队语义）：idle → prompt（兜底 "followUp"）；运行中 → followUp 排队。
   * 未驱动的落盘会话走懒接管（GLOSSARY Send-to-Attach，ADR-0012 补记十一）：file 在场时
   * 乐观注册最小快照（Pending Echo 顶住 attach 空窗）并发 attach 帧，attached 回包后
   * 先兑付浏览态挂起的选择再补发 prompt（补记十二）。插话走显式的 steerText
   * （Ctrl/Cmd+Enter 或 Queue Dock 行内「插话」）。
   *
   * 兜底理由（修订 ADR-0012 补记六）：内核 agent_start 的广播有窗口期，本地看似 idle
   * 时内核可能已在流式——无此字段内核会直接 throw，带 "followUp" 则转为排队（与新默认
   * 通道一致；idle 下该字段无作用，不影响正常 prompt）。
   *
   * 返回值 = 「这条消息有没有被接手」：false 时调用方**不得**清输入框与草稿（否则用户
   * 静默丢字）。当前只有一个 false 出口：懒接管但连接未就绪 / 无 file 可接管。
   */
  sendText(sessionId: string, text: string, file?: string): boolean {
    // attach 在途（懒接管空窗）：无论乐观会话壳是否已注册、也无论调用方是否还带着 file
    // （乐观注册后 Composer 已切到驱动分支，只传 sessionId），一律追加进待补发序列——
    // 否则第二条会以 drive prompt 直发未 attach 的 sessionId，服务端回 sessionNotDriven，
    // commandFailed 反把首条待回显抹掉（ADR-0012 补记十一「后续发送入列」）
    const inflightFile = this.inflight.fileFor(sessionId, file);
    if (inflightFile !== undefined) {
      // attach 帧不重发——重入 open 会撞 sessionId 冲突；本地待确认排队顶住显示，
      // 内核 queue 快照到达或回 idle 即让位；在途期间的新选择 merge 进待补发序列
      // 并清挂起（兑付以最新选择为准）
      const latest = this.store.getState().pendingChoices.get(sessionId);
      this.inflight.appendSend(inflightFile, text, latest);
      if (latest) {
        this.store.setState((state) => {
          const pendingChoices = new Map(state.pendingChoices);
          pendingChoices.delete(sessionId);
          return { pendingChoices };
        });
      }
      this.pushPendingQueue(sessionId, text);
      return true;
    }
    const session = this.store.getState().sessions.get(sessionId);
    if (!session) {
      // 懒接管：连接未就绪或无 file 时不挂凭证（发送帧会被静默丢弃 / 会话不可驱动）
      if (!file || !this.ws?.ready) return false;
      // 挂起选择先读后清：发送即随懒发送入列（兑付序见 pendingSendCommands），
      // 乐观显示让位给内核权威
      const choice = this.store.getState().pendingChoices.get(sessionId);
      this.store.setState((state) => ({
        sessions: new Map(state.sessions).set(sessionId, {
          sessionId,
          status: "idle" as const,
          entries: [],
          pendingPrompt: text,
        }),
        pendingChoices: (() => {
          const next = new Map(state.pendingChoices);
          next.delete(sessionId);
          return next;
        })(),
      }));
      this.inflight.registerSend(file, { sessionId, texts: [text], ...(choice ? { choice } : {}) });
      this.mirrorAttaching([], [sessionId]);
      this.send({ type: "attach", file });
      return true;
    }
    if (isBusyStatus(session.status)) {
      // 排队（GLOSSARY Queue Dock）：本地待确认 echo 顶住发送→快照回推间的空窗，
      // 内核 queue 帧到达即让位。连接未就绪时 send 静默丢弃，echo 不能先亮
      if (this.ws?.ready) this.pushPendingQueue(sessionId, text);
      this.send({ type: "drive", command: { sessionId, body: { type: "followUp", text } } });
      return true;
    }
    // 待回显（GLOSSARY「Pending Echo」）：权威 user 条目要等内核 assistant 的 message_start
    // 才回传（ADR-0012 补记四），这期间由本地气泡顶住内容区。
    if (this.ws?.ready) {
      this.store.setState((state) => ({
        sessions: new Map(state.sessions).set(sessionId, { ...session, pendingPrompt: text }),
      }));
    }
    this.send({
      type: "drive",
      command: { sessionId, body: { type: "prompt", text, streamingBehavior: "followUp" } },
    });
    return true;
  }

  /** 本地待确认排队行（Queue Dock 的 pending 行）：会话壳不在时静默跳过 */
  private pushPendingQueue(sessionId: string, text: string): void {
    this.store.setState((state) => {
      const current = state.sessions.get(sessionId);
      if (!current) return state;
      return {
        sessions: new Map(state.sessions).set(sessionId, {
          ...current,
          pendingQueue: [...(current.pendingQueue ?? []), text],
        }),
      };
    });
  }

  /** 显式插话（GLOSSARY「Steer」）：当前 assistant 轮边界即并入。idle 下无插话语义，
   *  回落为普通发送（Ctrl+Enter 空闲时=发送）；调用点仅在已驱动时存在（Composer 的
   *  steer 分支 gated on drive），故无懒接管路径 */
  steerText(sessionId: string, text: string): void {
    const session = this.store.getState().sessions.get(sessionId);
    if (!isBusyStatus(session?.status)) {
      this.sendText(sessionId, text);
      return;
    }
    this.send({ type: "drive", command: { sessionId, body: { type: "steer", text } } });
  }

  /** 整批重编（ADR-0016）：Queue Dock 行内编辑/删除/插话的唯一落点——
   *  clearQueue 后按新列表逐条重入队，通道随条目保留。idle 下队列本已清空，忽略 */
  rebuildQueue(sessionId: string, items: QueuedItem[]): void {
    const session = this.store.getState().sessions.get(sessionId);
    if (!isBusyStatus(session?.status)) return;
    this.send({ type: "drive", command: { sessionId, body: { type: "clearQueue" } } });
    for (const item of items) {
      const body: DriveCommandBody =
        item.channel === "steer" ? { type: "steer", text: item.text } : { type: "followUp", text: item.text };
      this.send({ type: "drive", command: { sessionId, body } });
    }
  }

  /** 切换模型（仅会话级，ADR-0016）：拒绝走 commandFailed 帧，错误条落在 lastError */
  setModel(sessionId: string, provider: string, modelId: string): void {
    this.send({ type: "drive", command: { sessionId, body: { type: "setModel", provider, modelId } } });
  }

  /** 调整 thinking 档位（仅会话级，ADR-0016） */
  setThinkingLevel(sessionId: string, level: string): void {
    this.send({ type: "drive", command: { sessionId, body: { type: "setThinkingLevel", level } } });
  }

  /** 压缩上下文（协议通道一直在，UI 入口以内建命令回归，ADR-0016 补记三）：
      压缩期间内核拒绝新 prompt，Composer 占位符由 compacting 状态接管 */
  compact(sessionId: string): void {
    this.send({ type: "drive", command: { sessionId, body: { type: "compact" } } });
  }

  abort(sessionId: string): void {
    this.send({ type: "drive", command: { sessionId, body: { type: "abort" } } });
  }
}

/** Queue Dock 行内操作的重编输入：文本 + 通道（GLOSSARY「Steer」/「Follow-up」） */
export interface QueuedItem {
  text: string;
  channel: "steer" | "followUp";
}

/** 模块级单例：驱动状态跨组件共享，一个页一条 WS 连接。
 *  node / 无浏览器全局时 connect() 自动跳过（导入安全），测试经 new DriveClient(deps) 注入假件 */
export const drive = new DriveClient();

// —— 浏览态目录缓存的持久化（补记十二/十三）：读写纯逻辑在 lib/catalog-cache（已测），
//    这里只挂模块导入期的副作用；node 测试环境无 localStorage，守卫静默跳过 ——

if (typeof localStorage !== "undefined") {
  try {
    const { catalogs, written } = loadCachedCatalogs(localStorage);
    if (catalogs.size > 0) drive.store.setState({ catalogs });

    // attached 登记即写穿：引用不变的高频帧零开销（subscribe 先比引用）
    let lastCatalogs = drive.store.getState().catalogs;
    drive.store.subscribe((state) => {
      if (state.catalogs === lastCatalogs) return;
      lastCatalogs = state.catalogs;
      persistCatalogs(localStorage, state.catalogs, written);
    });
  } catch {
    // 读不到就当作无缓存
  }
}

export function useDriveSessions(): ReadonlyMap<string, DriveSession> {
  return useStore(drive.store, (s) => s.sessions);
}

export function useDriveSession(id: string | undefined): DriveSession | undefined {
  const sessions = useDriveSessions();
  return id ? sessions.get(id) : undefined;
}

/** 浏览态 Model Seat 的缓存目录（补记十二）：驱动态不消费它（catalog 随 attached 帧新鲜到达），
    仅供未驱动的浏览态渲染可选菜单 */
export function useCachedCatalog(id: string | undefined): CachedCatalog | undefined {
  return useStore(drive.store, (s) => (id ? s.catalogs.get(id) : undefined));
}

/** 浏览态挂起的模型/档位选择（补记十二）：Model Seat 乐观显示的数据源；发送即清 */
export function usePendingChoice(id: string | undefined): ModelChoice | undefined {
  return useStore(drive.store, (s) => (id ? s.pendingChoices.get(id) : undefined));
}

/** attach 在途（C3）：ComposerMode 的 attaching 判据；selector 出原始布尔 */
export function useDriveAttaching(id: string | undefined): boolean {
  return useStore(drive.store, (s) => (id ? s.attaching.has(id) : false));
}

/** 运行指示的订阅原语（GLOSSARY: Running Indicator）：该 session 是否 live（running / retrying）。
    selector 出原始布尔：流式 delta 不改 DriveStatus，条目只在状态翻转时重渲（ADR-0015）。
    未驱动的 session 与 idle 同为 false——无运行指示。 */
export function useDriveLive(id: string | undefined): boolean {
  return useStore(drive.store, (s) => {
    const status = id ? s.sessions.get(id)?.status : undefined;
    return status === "running" || status === "retrying";
  });
}

/** 连接级错误（无 sessionId 归属）：订阅式读取，SessionView 顶部错误条消费 */
export function useConnectionError(): { message: string; code?: DriveErrorCode } | undefined {
  return useStore(drive.store, (s) => s.connectionError);
}

export type { DriveSession, DriveStatus };

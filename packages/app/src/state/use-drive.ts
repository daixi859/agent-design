// DriveClient：浏览器侧驱动连接（ADR-0012 阶段四）。组装层不做单测——
// 帧到状态的纯逻辑在 lib/drive-client（已测），WS 半边由 server 侧集成测试覆盖。
// 连接管理：断线指数退避重连；重连后按 file 表 re-attach（create 出的会话无 file，
// 由附着回包的快照支撑渲染，断线后从侧栏重新接管）。
// 状态壳（ADR-0015）：会话快照表与连接错误住 zustand vanilla store，React 端
// 经 useStore + selector 取切片（组件级更新）；本类只管 WS 生命周期与状态归约。
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { applyServerFrame, isBusyStatus, type DriveSession } from "../lib/drive-client";
import type { ClientFrame, DriveCommandBody, DriveErrorCode, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

/** 驱动状态切片：会话快照表 + 连接级错误（无 sessionId 归属） */
interface DriveState {
  sessions: ReadonlyMap<string, DriveSession>;
  connectionError: { message: string; code?: DriveErrorCode } | undefined;
}

class DriveClient {
  /** 状态壳（ADR-0015）：UI 订阅端一律 useStore(drive.store, selector) 取切片 */
  readonly store = createStore<DriveState>(() => ({ sessions: new Map(), connectionError: undefined }));
  /** sessionId → attach 时的 file（重连 re-attach 依据；create 会话不登记） */
  private files = new Map<string, string>();
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 500;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => {
      this.reconnectDelay = 500;
      // 重连后按 file 表重放 attach（attached 幂等保留已有条目）
      for (const file of new Set(this.files.values())) {
        this.send({ type: "attach", file });
      }
    };
    ws.onmessage = (message) => {
      this.handleFrame(JSON.parse(String(message.data)) as ServerFrame);
    };
    ws.onclose = () => {
      // 断线：待定的 create 立即失败，避免调用方永久悬挂
      this.failPendingCreates("驱动连接已断开");
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
    };
    this.ws = ws;
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.type === "error") {
      // 连接级错误（attach/create 被拒、坏帧）：落错误位并兑付待定 create；
      // 错误文案走 i18n（服务端只给 code），无 code 时退回服务端原文
      this.store.setState({ connectionError: { message: frame.message, code: frame.code } });
      this.settleCreates({ ok: false, message: frame.message });
      return;
    }
    // 非错误帧到达即连接恢复：仅在错误位挂起时清位，避免同值通知
    if (this.store.getState().connectionError !== undefined) {
      this.store.setState({ connectionError: undefined });
    }
    switch (frame.type) {
      case "attached":
        if (frame.file) this.files.set(frame.sessionId, frame.file);
        // create 路径无 file：兑付待定的新建导航
        else this.settleCreates({ ok: true, sessionId: frame.sessionId });
        break;
      case "released":
        this.files.delete(frame.sessionId);
        break;
    }
    const sessionId = "event" in frame ? frame.event.sessionId : frame.sessionId;
    const current = this.store.getState().sessions.get(sessionId);
    const next = applyServerFrame(current, frame);
    if (next === current) return;
    this.store.setState((state) => {
      const sessions = new Map(state.sessions);
      if (next) sessions.set(sessionId, next);
      else sessions.delete(sessionId);
      return { sessions };
    });
  }

  // —— 新建会话的待定应答（create 无 file，靠 attached/error 帧兑付；断线也要兑付） ——

  private pendingCreates: Array<{ resolve: (sessionId: string) => void; reject: (err: Error) => void }> = [];

  private settleCreates(outcome: { ok: true; sessionId: string } | { ok: false; message: string }): void {
    const pending = this.pendingCreates.shift();
    if (!pending) return;
    if (outcome.ok) pending.resolve(outcome.sessionId);
    else pending.reject(new Error(outcome.message));
  }

  /** 连接断开：待定的 create 立即失败，避免调用方的 .then 永久悬挂 */
  private failPendingCreates(message: string): void {
    for (const pending of this.pendingCreates.splice(0)) pending.reject(new Error(message));
  }

  // —— 对 UI 的命令面 ——

  /** 该 session 当前是否被驱动（Live Tail 停用判定、Composer 活性判定共用） */
  isDriven(sessionId: string): boolean {
    return this.store.getState().sessions.has(sessionId);
  }

  /** 非响应读取单个会话快照（effect 里的一次性取值；响应式消费走 useDriveSession） */
  session(sessionId: string): DriveSession | undefined {
    return this.store.getState().sessions.get(sessionId);
  }

  get connectionError(): { message: string; code?: DriveErrorCode } | undefined {
    return this.store.getState().connectionError;
  }

  /** 接管已有 session（GLOSSARY: Attach） */
  attach(file: string): void {
    this.send({ type: "attach", file });
  }

  /** 在项目 cwd 新建 session（GLOSSARY: Drive）；resolve 为 attached 帧带回的新 sessionId */
  create(cwd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pendingCreates.push({ resolve, reject });
      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.pendingCreates.pop();
        reject(new Error("驱动连接未就绪"));
        return;
      }
      this.send({ type: "create", cwd });
    });
  }

  release(sessionId: string): void {
    this.files.delete(sessionId);
    this.store.setState((state) => {
      if (!state.sessions.has(sessionId)) return state;
      const sessions = new Map(state.sessions);
      sessions.delete(sessionId);
      return { sessions };
    });
    this.send({ type: "release", sessionId });
  }

  /**
   * 语义化发送（ADR-0017 排队语义）：idle → prompt（兜底 "followUp"）；运行中 → followUp 排队。
   * 插话走显式的 steerText（Ctrl/Cmd+Enter 或 Queue Dock 行内「插话」）。
   *
   * 兜底理由（修订 ADR-0012 补记六）：内核 agent_start 的广播有窗口期，本地看似 idle
   * 时内核可能已在流式——无此字段内核会直接 throw，带 "followUp" 则转为排队（与新默认
   * 通道一致；idle 下该字段无作用，不影响正常 prompt）。
   */
  sendText(sessionId: string, text: string): void {
    const session = this.store.getState().sessions.get(sessionId);
    if (isBusyStatus(session?.status)) {
      // 排队（GLOSSARY Queue Dock）：本地待确认 echo 顶住发送→快照回推间的空窗，
      // 内核 queue 帧到达即让位。连接未就绪时 send 静默丢弃，echo 不能先亮
      if (session && this.ws?.readyState === WebSocket.OPEN) {
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
      this.send({ type: "drive", command: { sessionId, body: { type: "followUp", text } } });
      return;
    }
    // 待回显（GLOSSARY「Pending Echo」）：权威 user 条目要等内核 assistant 的 message_start
    // 才回传（ADR-0012 补记四），这期间由本地气泡顶住内容区。
    if (session && this.ws?.readyState === WebSocket.OPEN) {
      this.store.setState((state) => ({
        sessions: new Map(state.sessions).set(sessionId, { ...session, pendingPrompt: text }),
      }));
    }
    this.send({
      type: "drive",
      command: { sessionId, body: { type: "prompt", text, streamingBehavior: "followUp" } },
    });
  }

  /** 显式插话（GLOSSARY「Steer」）：当前 assistant 轮边界即并入。idle 下无插话语义，
   *  回落为普通发送（Ctrl+Enter 空闲时=发送） */
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

  /** 手动压缩上下文（Trigger Menu 内建映射，ADR-0016）：生命周期经 compaction 事件回推 */
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

/** 模块级单例：驱动状态跨组件共享，一个页一条 WS 连接 */
export const drive = new DriveClient();

export function useDriveSessions(): ReadonlyMap<string, DriveSession> {
  return useStore(drive.store, (s) => s.sessions);
}

export function useDriveSession(id: string | undefined): DriveSession | undefined {
  const sessions = useDriveSessions();
  return id ? sessions.get(id) : undefined;
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

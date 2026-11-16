// DriveClient：浏览器侧驱动连接（ADR-0012 阶段四）。组装层不做单测——
// 帧到状态的纯逻辑在 lib/drive-client（已测），WS 半边由 server 侧集成测试覆盖。
// 连接管理：断线指数退避重连；重连后按 file 表 re-attach（create 出的会话除外，
// 其已落盘为真实 JSONL，从侧栏重新接管即可）。
import { useSyncExternalStore } from "react";
import { applyServerFrame, type DriveSession } from "../lib/drive-client";
import type { ClientFrame, DriveCommandBody, DriveStatus, ServerFrame } from "@pi-studio/shared/protocol";

class DriveClient {
  private sessions = new Map<string, DriveSession>();
  /** sessionId → attach 时的 file（重连 re-attach 依据；create 会话不登记） */
  private files = new Map<string, string>();
  private snapshot = new Map(this.sessions);
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 500;
  private closed = false;

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
      if (this.closed) return;
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
      // attach/create 被拒等连接级错误：无 sessionId 归属，暂以控制台暴露（阶段一）
      console.warn("[drive]", frame.message);
      return;
    }
    switch (frame.type) {
      case "attached":
        if (frame.file) this.files.set(frame.sessionId, frame.file);
        break;
      case "released":
        this.files.delete(frame.sessionId);
        break;
    }
    const sessionId = "event" in frame ? frame.event.sessionId : frame.sessionId;
    const next = applyServerFrame(this.sessions.get(sessionId), frame);
    if (next === this.sessions.get(sessionId)) return;
    if (next) this.sessions.set(sessionId, next);
    else this.sessions.delete(sessionId);
    this.snapshot = new Map(this.sessions);
    for (const listener of this.listeners) listener();
  }

  private notifyOnly(): void {
    this.snapshot = new Map(this.sessions);
    for (const listener of this.listeners) listener();
  }

  // —— 对 UI 的命令面 ——

  /** 该 session 当前是否被驱动（Live Tail 停用判定、Composer 活性判定共用） */
  isDriven(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** 接管已有 session（GLOSSARY: Attach） */
  attach(file: string): void {
    this.send({ type: "attach", file });
  }

  /** 在项目 cwd 新建 session（GLOSSARY: Drive）；attached 帧到达后由 UI 导航 */
  create(cwd: string): void {
    this.send({ type: "create", cwd });
  }

  release(sessionId: string): void {
    this.files.delete(sessionId);
    this.sessions.delete(sessionId);
    this.notifyOnly();
    this.send({ type: "release", sessionId });
  }

  /** 语义化发送：running 中转 steer，否则 prompt（与 pi TUI 输入语义一致） */
  sendText(sessionId: string, text: string): void {
    const body: DriveCommandBody =
      this.sessions.get(sessionId)?.status === "running"
        ? { type: "steer", text }
        : { type: "prompt", text };
    this.send({ type: "drive", command: { sessionId, body } });
  }

  abort(sessionId: string): void {
    this.send({ type: "drive", command: { sessionId, body: { type: "abort" } } });
  }

  // —— 订阅面（useSyncExternalStore） ——

  getSnapshot(): ReadonlyMap<string, DriveSession> {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** 模块级单例：驱动状态跨组件共享，一个页一条 WS 连接 */
export const drive = new DriveClient();

export function useDriveSessions(): ReadonlyMap<string, DriveSession> {
  return useSyncExternalStore(
    (cb) => drive.subscribe(cb),
    () => drive.getSnapshot(),
  );
}

export function useDriveSession(id: string | undefined): DriveSession | undefined {
  const sessions = useDriveSessions();
  return id ? sessions.get(id) : undefined;
}

export type { DriveSession, DriveStatus };

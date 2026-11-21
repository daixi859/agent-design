// 驱动控制层：协议的连接级语义，传输无关（ADR-0019）。
// 从 ws-gateway 抽出：attach 幂等重放、单客户端租约（Server Lease）、attached 帧组装、
// drive → commandFailed / disposition 映射、按 sessionId 的事件路由。
// 传输适配器（WS / Electron IPC）只负责「帧怎么进出连接」「连接怎么判活」两件事：
//   - WS：JSON 编解码 + upgrade 握手 + ping/pong 心跳传感器；
//   - IPC：MessagePort 编解码（端口断开即连接消亡，无需心跳）。
// 属主身份仍是连接对象本身（OwnerToken，C7）；本层不感知 socket、不持定时器。
import { errorMessage } from "@pi-studio/shared/errors";
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type {
  ClientFrame,
  ContextUsageInfo,
  DriveCommand,
  DriveErrorCode,
  DriveEvent,
  DriveOutcome,
  ServerFrame,
  SessionCatalog,
} from "@pi-studio/shared/protocol";
import type { OwnerToken } from "@pi-studio/core";

/** drive 命令的处理结果（ADR-0012 补记十七）：形状与语义归协议层（SessionHost.dispatch
 *  的产出，两端共用），本模块只做帧映射 */
export type { DriveOutcome };

/** 打开会话的返回值：sessionId + 内核当前快照 + 模型/命令目录与用量快照（ADR-0016）。
 *  快照只随 create 下发（attach 的会话已落盘，基线走 REST），目录与用量则两边都带 */
export interface OpenedSession {
  sessionId: string;
  snapshot(): SessionSnapshot;
  catalog(): SessionCatalog;
  usage(): ContextUsageInfo | undefined;
}

/** 控制层对 registry 的窄投影（attach/create/release/drive + 属主单表读投影），组装层注入 */
export interface DriveControlDeps {
  attach(file: string, owner: OwnerToken): Promise<OpenedSession>;
  create(cwd: string, owner: OwnerToken): Promise<OpenedSession>;
  /** 已驱动会话按 sessionId 取回（同连接 attach 重放回 attached 帧，不开新宿主） */
  get(sessionId: string): OpenedSession | undefined;
  /** 按 attach 文件查 sessionId（重放幂等判定用） */
  sessionOf(file: string): string | undefined;
  /** 会话的属主连接（单表读投影，C7） */
  ownerOf(sessionId: string): OwnerToken | undefined;
  /** 该属主是否仍有存活登记（心跳判死的传感器读数） */
  isOwnerAlive(owner: OwnerToken): boolean;
  /** 心跳投喂：判活 / 判死（无心跳的传输不调用） */
  markAlive(owner: OwnerToken): void;
  markDead(owner: OwnerToken): void;
  /** 连接消亡：按属主单表释放名下全部会话，返回 sessionId（路由订阅随之撤销） */
  releaseByOwner(owner: OwnerToken): string[];
  release(sessionId: string): void;
  drive(command: DriveCommand): Promise<DriveOutcome>;
}

/** 传输中立的连接：只要求「送帧」与「关闭」两个动作。
 *  属主身份即连接对象本身（C7 的透明令牌），本层只做同一性比较。 */
export interface DriveConnection {
  send(frame: ServerFrame): void;
  close(): void;
}

/** 存活判定由传输注入：WS 用心跳窗口，IPC 无心跳（端口断开即消亡）可缺省为恒真 */
export interface DriveControlOptions {
  isLive?(connection: DriveConnection): boolean;
}

export interface DriveControl {
  /** 新连接接入：租约判定（被拒即回 serverBusy 并关闭），返回是否接纳 */
  accept(connection: DriveConnection): boolean;
  /** 帧入口（已解码的协议帧） */
  receive(connection: DriveConnection, frame: ClientFrame): void;
  /** 帧无法解码（适配器的编解码失败）：回 badFrame 错误帧，连接不断 */
  badFrame(connection: DriveConnection, message: string): void;
  /** 连接消亡（close / 端口断开）：按属主单表释放名下会话并撤订阅 */
  drop(connection: DriveConnection): void;
  /** 事件出口：按 sessionId 路由到订阅了该会话的连接 */
  emit(event: DriveEvent): void;
  /** 心跳投喂（适配器的巡检调用；无心跳的传输不调用） */
  markAlive(connection: DriveConnection): void;
  markDead(connection: DriveConnection): void;
  /** 当前租约持有者（适配器巡检用：只 ping 持有者会漏掉已退订连接，故巡检仍需连接全集） */
  readonly lease: DriveConnection | undefined;
}

export function createDriveControl(
  deps: DriveControlDeps,
  opts: DriveControlOptions = {},
): DriveControl {
  // sessionId → 订阅它的连接集合（emit 路由表；属主记账在 registry 单表，这里只有路由）
  const subscriptions = new Map<string, Set<DriveConnection>>();
  const isLive = opts.isLive ?? (() => true);

  // 单客户端租约：同一时刻只服务一个控制连接，后来者直接拒绝
  let leaseHolder: DriveConnection | undefined;

  function unsubscribe(sessionId: string, connection: DriveConnection): void {
    const set = subscriptions.get(sessionId);
    if (!set) return;
    set.delete(connection);
    if (set.size === 0) subscriptions.delete(sessionId);
  }

  function claim(sessionId: string, connection: DriveConnection): void {
    let set = subscriptions.get(sessionId);
    if (!set) {
      set = new Set();
      subscriptions.set(sessionId, set);
    }
    set.add(connection);
  }

  /** 撤销某连接的全部属主与订阅（租约让位时用）：属主经 registry 单表释放，
   *  其 close 迟到时属主已不是它，releaseByOwner 不会重复触及 */
  function evict(connection: DriveConnection): void {
    for (const sessionId of deps.releaseByOwner(connection)) unsubscribe(sessionId, connection);
    for (const sessionId of [...subscriptions.keys()]) unsubscribe(sessionId, connection);
  }

  /** attached 帧统一出口：快照只随 create 下发（attach 的会话已落盘，基线走 REST，
      ADR-0012：读路径不变）；目录与用量（ADR-0016）两边都带——宿主构造期无订阅者，
      这两份初始状态只能随 attached 帧走，不能靠事件（同补记二的时序坑） */
  function sendAttached(connection: DriveConnection, opened: OpenedSession, file?: string): void {
    const { sessionId } = opened;
    const snapshot = file === undefined ? opened.snapshot() : undefined;
    const catalog = opened.catalog();
    const usage = opened.usage();
    connection.send({
      type: "attached",
      sessionId,
      ...(snapshot ? { header: snapshot.header, entries: snapshot.entries } : {}),
      ...(file ? { file } : {}),
      ...(catalog.model || catalog.commands ? { catalog } : {}),
      ...(usage ? { usage } : {}),
    });
  }

  /** attach / create 共用骨架：打开 → 回 attached → 登记订阅。
   *  attach 失败的 error 帧携 file 回显（Send-to-Attach 按它精确兑付，ADR-0012 补记十一）；
   *  活属主拒绝 / 僵尸接管由 registry.open 按属主单表判定（C7） */
  async function openSubscription(
    connection: DriveConnection,
    open: () => Promise<OpenedSession>,
    file?: string,
  ): Promise<void> {
    try {
      const opened = await open();
      const { sessionId } = opened;
      claim(sessionId, connection);
      sendAttached(connection, opened, file);
    } catch (err) {
      // 机器码供客户端走 i18n（ADR-0011）；服务端文案仅作调试兜底
      const code = (err as { code?: DriveErrorCode }).code;
      connection.send({
        type: "error",
        message: errorMessage(err),
        ...(code ? { code } : {}),
        ...(file ? { file } : {}),
      });
    }
  }

  async function handleFrame(connection: DriveConnection, frame: ClientFrame): Promise<void> {
    switch (frame?.type) {
      case "attach": {
        // 幂等重放（同连接，use-drive 断线重连契约「attached 幂等保留已有条目」）：
        // 直接回 attached，不开新宿主。其余情形（活属主拒绝 / 僵尸接管）都交给
        // registry.attach 按属主单表判定——僵尸先在这里摘除其订阅路由
        const existing = deps.sessionOf(frame.file);
        if (existing !== undefined) {
          const owner = deps.ownerOf(existing);
          if (owner === connection) {
            const opened = deps.get(existing);
            if (opened) {
              claim(existing, connection);
              sendAttached(connection, opened, frame.file);
              return;
            }
            deps.release(existing);
          } else if (owner !== undefined && !deps.isOwnerAlive(owner)) {
            // 僵尸属主：registry 侧随 attach 释放旧宿主，路由表先摘其订阅
            // （OwnerToken 在传输里就是连接对象——deps 投影把它按不透明令牌带回）
            deps.release(existing);
            unsubscribe(existing, owner as DriveConnection);
          }
        }
        return openSubscription(connection, () => deps.attach(frame.file, connection), frame.file);
      }
      case "create":
        return openSubscription(connection, () => deps.create(frame.cwd, connection));
      case "release":
        deps.release(frame.sessionId);
        unsubscribe(frame.sessionId, connection);
        connection.send({ type: "released", sessionId: frame.sessionId });
        return;
      case "drive": {
        const { sessionId, body } = frame.command;
        try {
          const outcome = await deps.drive(frame.command);
          if (!outcome.ok) {
            // command 回带被拒命令类型：client 只让文本命令的待回显让位（ADR-0012 补记十二）
            connection.send({
              type: "commandFailed",
              sessionId,
              message: outcome.message,
              command: body.type,
              ...(outcome.code ? { code: outcome.code } : {}),
            });
          } else if (outcome.disposition && (body.type === "steer" || body.type === "followUp")) {
            connection.send({ type: "disposition", sessionId, command: body.type, disposition: outcome.disposition });
          }
        } catch (err) {
          connection.send({ type: "commandFailed", sessionId, message: errorMessage(err), command: body.type });
        }
        return;
      }
      default:
        connection.send({ type: "error", message: "未知帧类型", code: "unknownFrame" });
    }
  }

  return {
    accept(connection) {
      // 已有存活持有者：拒绝后来者（不进入消息处理，不登记属主）
      if (leaseHolder && leaseHolder !== connection && isLive(leaseHolder)) {
        connection.send({ type: "error", message: "服务已被其它窗口占用", code: "serverBusy" });
        connection.close();
        return false;
      }
      // 持有者已断开或心跳超期（僵尸）：先撤其属主，再让位给本连接
      if (leaseHolder && leaseHolder !== connection) evict(leaseHolder);
      leaseHolder = connection;
      return true;
    },
    receive(connection, frame) {
      void handleFrame(connection, frame);
    },
    badFrame(connection, message) {
      connection.send({ type: "error", message, code: "badFrame" });
    },
    drop(connection) {
      if (leaseHolder === connection) leaseHolder = undefined;
      // 连接消亡即按属主单表释放名下会话（ADR-0012：内存标记随生命周期消亡）。
      // 守卫是结构性的：新属主接管后登记的 owner 已换人，releaseByOwner 不触及；
      // close 迟到的僵尸由心跳 terminate 后走到这里兜底。
      for (const sessionId of deps.releaseByOwner(connection)) unsubscribe(sessionId, connection);
      for (const sessionId of [...subscriptions.keys()]) unsubscribe(sessionId, connection);
    },
    emit(event) {
      const set = subscriptions.get(event.sessionId);
      if (!set) return;
      const frame: ServerFrame = { type: "event", event };
      for (const connection of set) connection.send(frame);
    },
    markAlive(connection) {
      deps.markAlive(connection);
    },
    markDead(connection) {
      deps.markDead(connection);
    },
    get lease() {
      return leaseHolder;
    },
  };
}

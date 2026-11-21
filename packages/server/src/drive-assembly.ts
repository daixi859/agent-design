// registry → 驱动控制层的窄投影（ADR-0019）：WS 适配器（server）与 IPC 适配器（desktop）
// 共用**这一份**组装，使两个传输层拿到逐条相同的语义——属主单表读写、drive 的未驱动守卫、
// 事件的回灌口都由本文件一处声明。两个适配器只负责「帧怎么进出」，不知道 registry 的形状。
import type { DriveCommand, DriveEvent, DriveOutcome } from "@pi-studio/shared/protocol";
import { globalCatalog, type SessionRegistry } from "@pi-studio/core";
import type { DriveControlDeps } from "./drive-control.ts";
import type { ApiDeps } from "./api-routes.ts";

/**
 * 组装控制层依赖。
 *
 * 取 registry 的是**取值函数**而非实例：registry 与控制层互相引用（registry 的 emit
 * 回灌到控制层的路由表），实例化顺序上必须先有控制层、后能把 registry 交给它。
 * 传 getter 让这条循环引用显式且只在调用时求值，不在模块初始化期碰未赋值的绑定。
 */
export function registryDriveDeps(getRegistry: () => SessionRegistry): DriveControlDeps {
  const registry = () => getRegistry();
  return {
    attach: (file, owner) => registry().attach(file, owner),
    create: (cwd, owner) => registry().create(cwd, owner),
    get: (sessionId) => registry().get(sessionId),
    sessionOf: (file) => registry().sessionOf(file),
    // 属主单表的窄投影（C7）：registry 记账，传输层只读判定与投喂存活
    ownerOf: (sessionId) => registry().ownerOf(sessionId),
    isOwnerAlive: (owner) => registry().isOwnerAlive(owner),
    markAlive: (owner) => registry().markAlive(owner),
    markDead: (owner) => registry().markDead(owner),
    releaseByOwner: (owner) => registry().releaseByOwner(owner),
    release: (sessionId) => registry().release(sessionId),
    drive: (command) => driveCommand(registry(), command),
  };
}

/** drive 帧到 SessionHost 的分发：等/不等与错误落点都在 dispatch 一处定
 *  （ADR-0012 补记十七），组装层只留「未驱动会话」的守卫 */
export function driveCommand(registry: SessionRegistry, command: DriveCommand): Promise<DriveOutcome> {
  const host = registry.get(command.sessionId);
  if (!host) {
    return Promise.resolve({
      ok: false,
      code: "sessionNotDriven",
      message: `session 未驱动：${command.sessionId}`,
    });
  }
  return host.dispatch(command.body);
}

/** registry 的 emit 出口形状（构造 registry 时传入）：两个传输层都把它接到控制层的 emit */
export type RegistryEmit = (event: DriveEvent) => void;

/**
 * 浏览取数 deps 的**单源组装**（与 registryDriveDeps 同一先例：registry 的窄投影）。
 * 曾经 desktop/main 与 server/main 各写一份 `{ isFileDriven, catalog }` 字面量——
 * 语义注释成对复制，漂移无人知晓。Send-to-Attach 的 driven 标记与全局目录的取法
 * 都由这里定，两个形态（REST server / 桌面壳）天然一致。
 */
export function browseApiDeps(registry: SessionRegistry): ApiDeps {
  return {
    // Send-to-Attach：列表标 driven（桌面壳内单窗口，恒为本人驱动，仅供跨进程残留提示）
    isFileDriven: (file: string) => registry.isFileDriven(file),
    // 全局目录：内核态投影（ADR-0012 补记十四/十五）
    catalog: () => globalCatalog(),
  };
}

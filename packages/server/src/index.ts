// 本包的**库出口**（ADR-0019）：给桌面壳（以及其它传输层）复用的传输无关部分。
// 刻意不导出 ./main.ts 的任何东西——那是独立 server 进程的入口，导入即 listen。
//
//   api-routes     浏览端点的纯函数层（path + query → 数据，无 node:http 类型）
//   drive-control  驱动协议的连接级语义（租约、attach 重放、帧映射、事件路由）
//   drive-assembly registry → 控制层的窄投影（两个传输层共用一份组装）
//   http-routing   路由重写的纯函数（/api 剥前缀、静态路径归一）
//
// pi-data.ts（http 壳）与 ws-gateway.ts（WS 适配器）不导出：桌面壳不用它们。
export { resolveApi, consumeCompleteLines } from "./api-routes.ts";
export type { ApiDeps, ApiResult, ApiPayload, IsFileDriven } from "./api-routes.ts";
export { createDriveControl } from "./drive-control.ts";
export type {
  DriveConnection,
  DriveControl,
  DriveControlDeps,
  DriveControlOptions,
  DriveOutcome,
  OpenedSession,
} from "./drive-control.ts";
export { registryDriveDeps, driveCommand, browseApiDeps } from "./drive-assembly.ts";
export type { RegistryEmit } from "./drive-assembly.ts";
export { stripApiPrefix, staticRelPath } from "./http-routing.ts";
export { dispatchApi } from "./dispatch-api.ts";
export type { ApiReplyShape } from "./dispatch-api.ts";

/** 驱动协议错误码 → i18n 文案键的唯一映射（服务端只给 code，文案在客户端，ADR-0011）。
    无 code 或未知 code 时退回服务端原文（调试兜底）。 */
import type { DriveErrorCode } from "@pi-studio/shared/protocol";
import type { MessageKey } from "./i18n";

const CODE_KEYS: Record<DriveErrorCode, MessageKey> = {
  sessionConflict: "errSessionConflict",
  sessionNotDriven: "errSessionNotDriven",
  badFrame: "errBadFrame",
  unknownFrame: "errUnknownFrame",
  serverBusy: "errServerBusy",
};

/** 把 (code, serverMessage) 收敛成可展示文案 */
export function driveErrorText(
  code: DriveErrorCode | undefined,
  serverMessage: string,
  t: (key: MessageKey) => string,
): string {
  return code ? t(CODE_KEYS[code]) : serverMessage;
}

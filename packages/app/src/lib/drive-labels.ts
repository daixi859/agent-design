/** 驱动状态 → 文案的唯一映射（Session Bar 徽标与 Composer 徽标共用，避免三元链重复） */
import type { DriveStatus } from "@pi-studio/shared/protocol";
import type { MessageKey } from "./i18n";

/** 状态徽标的文案键；idle 显示「驱动中」（已接管但空闲） */
export function driveBadgeKey(status: DriveStatus): MessageKey {
  if (status === "running") return "runningBadge";
  if (status === "retrying") return "retryingBadge";
  return "drivenBadge";
}

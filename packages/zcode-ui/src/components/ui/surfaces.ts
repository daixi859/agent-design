/**
 * 浮层外壳的共享配方（ADR-0020「共享配方单一来源」在 TSX 层的落地）。
 * Select / DropdownMenu / Popover / Dialog 的外壳逐字相同的一段，改一处即可全局生效；
 * 各组件只写与配方的差（宽度、圆角档位、z 层级由调用点补）。
 */

/** 菜单类浮层（SelectContent / DropdownMenuContent）：圆角 lg + 菜单底色 + 1px 内边距。 */
export const menuSurface =
  "flex flex-col gap-0.5 overflow-x-hidden rounded-lg border border-popover-border bg-menu p-1 text-foreground shadow-md duration-100";

/** 卡片类浮层（Popover / Dialog）：圆角更大，底色用 popover。 */
export const popoverSurface =
  "flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-ui-base text-popover-foreground shadow-md duration-100";

/** 浮层进出场动画：四个组件共用同一组 data-open / data-closed 关键帧类。 */
export const overlayMotion =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

/** 浮层遮罩：四套主题共用一档（遮罩不随明暗翻转）。 */
export const overlayScrim =
  "fixed inset-0 isolate z-50 bg-overlay duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

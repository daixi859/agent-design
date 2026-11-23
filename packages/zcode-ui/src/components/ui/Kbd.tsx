import * as React from "react";

import { cn } from "../../lib/cn";

/**
 * ZCode 的 Kbd 复用 ControlShortcutBadge（快捷键提示徽标）；
 * 本包不含 ZCode 的 i18n 与平台检测，键帽样式直接内联复刻。
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "rounded-md h-4 inline-flex shrink-0 items-center bg-tooltip-tag px-1.5 text-ui-xs font-medium leading-none text-tooltip-tag-foreground",
        "font-mono",
        "pointer-events-none min-w-4 select-none justify-center gap-1",
        className,
      )}
      {...props}
    />
  );
}

/** 键帽组合容器：把一次组合的多个键横排（gap-1），如 ⌘ + K。 */
function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
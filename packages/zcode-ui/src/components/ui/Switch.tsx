import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

export type SwitchSize = "sm" | "default";

/** 开关：radix Switch 负责 aria-checked 与键盘切换，样式沿用 ZCode 的 18/32 与 16/28 两档。 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: SwitchSize }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-px transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-input-border-focused/30 aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 data-[size=default]:h-[18px] data-[size=default]:w-[32px] data-[size=sm]:h-[16px] data-[size=sm]:w-[28px] data-checked:bg-primary data-unchecked:bg-primary/30 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-primary-foreground ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3.5 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

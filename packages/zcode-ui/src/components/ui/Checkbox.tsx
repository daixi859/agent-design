import * as React from "react";
import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

export type CheckboxState = boolean | "indeterminate";

export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  /** 勾选图标线宽（稠密列表里调细用）；传值时同时禁用描边缩放。 */
  checkIconStrokeWidth?: number;
};

/** 复选框：radix 提供三态（checked / indeterminate）与键盘支持，图标按状态切换。 */
function Checkbox({ className, checkIconStrokeWidth, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-input-border bg-input text-primary-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-input-border-focused/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current [&[data-state=indeterminate]_[data-slot=checkbox-checked-icon]]:hidden [&[data-state=indeterminate]_[data-slot=checkbox-indeterminate-icon]]:block"
      >
        <Check
          data-slot="checkbox-checked-icon"
          className={cn(
            "size-3",
            checkIconStrokeWidth !== undefined && "[&_path]:[vector-effect:non-scaling-stroke]",
          )}
          strokeWidth={checkIconStrokeWidth}
        />
        <Minus
          data-slot="checkbox-indeterminate-icon"
          className={cn(
            "hidden size-3",
            checkIconStrokeWidth !== undefined && "[&_path]:[vector-effect:non-scaling-stroke]",
          )}
          strokeWidth={checkIconStrokeWidth}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

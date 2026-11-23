import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

export interface ProgressSegment {
  className?: string;
  id: string;
  /** 0–1 的小数（与 ZCode 一致，组件内钳制）。 */
  percent: number;
  style?: React.CSSProperties;
}

export type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  /** 分段形态：按百分比切分同一条指示条（用量构成图）。 */
  segments?: readonly ProgressSegment[];
};

/** 进度条：单色填充与分段（segments）两种形态共用一条轨道。 */
function Progress({ className, indicatorClassName, segments, value, ...props }: ProgressProps) {
  const normalizedValue = Math.min(Math.max(value ?? 0, 0), 100);
  const normalizedSegments =
    segments
      ?.map((segment) => ({
        ...segment,
        percent: Math.min(Math.max(segment.percent, 0), 1),
      }))
      .filter((segment) => segment.percent > 0) ?? [];

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      // value 必须交给 radix：它据此写 aria-valuenow 与 data-state（缺了会永远停在 indeterminate）。
      value={normalizedValue}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-md bg-muted",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-full transition-[width]",
          normalizedSegments.length > 0 ? "flex overflow-hidden bg-transparent" : "bg-primary",
          normalizedValue > 0 && indicatorClassName,
        )}
        style={{ width: `${normalizedValue}%` }}
      >
        {normalizedSegments.map((segment) => (
          <span
            aria-hidden="true"
            className={cn("h-full shrink-0", segment.className)}
            key={segment.id}
            style={{ ...segment.style, flexBasis: `${segment.percent * 100}%` }}
          />
        ))}
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";

/**
 * ZCode 的 Toast 是 sonner 风格的自绘堆叠（依赖 toast store）；本包只复刻单条样式。
 * 动作区按钮、键帽提示与 ZCode 同版式。
 */
const toastVariants = cva(
  "pointer-events-auto flex w-80 items-start gap-3 rounded-xl border p-3 text-ui-base shadow-md",
  {
    variants: {
      variant: {
        default: "border-border bg-toast text-foreground",
        success: "border-success/30 bg-success-surface text-success-surface-foreground",
        warning: "border-warning/40 bg-warning-surface text-warning-surface-foreground",
        destructive:
          "border-destructive/40 bg-destructive-surface text-destructive-surface-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>;

export type ToastProps = React.ComponentProps<"div"> &
  VariantProps<typeof toastVariants> & {
    title: React.ReactNode;
    description?: React.ReactNode;
    actionLabel?: string;
    shortcut?: string;
    onAction?: () => void;
  };

function Toast({
  className,
  variant = "default",
  title,
  description,
  actionLabel,
  shortcut,
  onAction,
  ...props
}: ToastProps) {
  return (
    <div
      data-slot="toast"
      data-variant={variant}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="font-medium">{title}</div>
        {description ? (
          <div className="text-ui-sm text-foreground-subtle">{description}</div>
        ) : null}
      </div>
      {actionLabel ? (
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </Button>
      ) : null}
    </div>
  );
}

export { Toast, toastVariants };

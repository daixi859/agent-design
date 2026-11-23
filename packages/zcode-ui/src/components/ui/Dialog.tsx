import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";
import { Button } from "./Button";
import { overlayScrim } from "./surfaces";

/**
 * 对话框：radix 负责 Portal、焦点陷阱、Escape 与滚动锁，样式沿用 ZCode。
 * 文案不外置成固定中文——按钮标签由 closeLabel 传入，缺省英文供上层 i18n 覆盖。
 */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(overlayScrim, className)}
      {...props}
    />
  );
}

// 圆角规范迁移（ZCode）：默认外壳统一 2xl，截图/附件预览入口显式保留 xl，内容层级独立计算。
function DialogContent({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  overlayClassName,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  showOverlay?: boolean;
  overlayClassName?: string;
  /** 右上角关闭按钮的无障碍标签与页脚关闭按钮的文案（缺省英文，由上层 i18n 覆盖）。 */
  closeLabel?: string;
}) {
  return (
    <DialogPortal>
      {showOverlay ? <DialogOverlay className={overlayClassName} /> : null}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-popover-border bg-popover p-4 text-ui-base/relaxed text-foreground shadow-md duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:max-w-lg [app-region:no-drag]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              type="button"
              variant="ghost"
              className="absolute top-4 right-4 z-20 hover:bg-surface-hover [app-region:no-drag]"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">{closeLabel}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel = "Close",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
  /** 与 DialogContent 同源，只在这里渲染文字按钮。 */
  closeLabel?: string;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{closeLabel}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-ui-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-ui-base/relaxed text-foreground-subtle *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

/** 折叠区：高度动画由 radix 写入的 --radix-collapsible-content-height 驱动。 */
function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden",
        "data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up data-[state=closed]:[animation-fill-mode:forwards] duration-300 ease-in-out transition-none",
        "data-[state=open]:[&>div]:animate-in data-[state=open]:[&>div]:fade-in-0",
        "data-[state=closed]:[&>div]:animate-out data-[state=closed]:[&>div]:fade-out-0 data-[state=closed]:[&>div]:[animation-fill-mode:forwards]",
        className,
      )}
      {...props}
    >
      {/* 内层只承担透明度动画：高度动画与淡入淡出分层，避免同名 group 的祖先 state 串扰。 */}
      <div className="transition-none duration-300 ease-in-out">{children}</div>
    </CollapsiblePrimitive.Content>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

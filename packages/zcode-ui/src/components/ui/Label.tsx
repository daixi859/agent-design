import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

/** 表单标签：点击时聚焦关联控件（radix Label），disabled 态由控件自身的 peer 类表达。 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-ui-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

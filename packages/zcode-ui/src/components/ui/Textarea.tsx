import * as React from "react";

import { cn } from "../../lib/cn";

/** 多行输入：field-sizing-content 自增高，ref 走 React 19 的 ref-as-prop。 */
function Textarea({ className, ref, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-input-border bg-input/20 px-2 py-2 text-ui-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-ui-base/relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

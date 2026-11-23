import { LoaderCircle } from "lucide-react";

import { cn } from "../../lib/cn";

/** 加载指示：`role=status` + 可覆盖的 aria-label（缺省英文，由上层 i18n 覆盖）。 */
function Spinner({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** 合并 Tailwind 类名（拷贝自 ZCode components/lib/utils.ts，含 text-ui-* 字号组的显式注册）。 */
const mergeUiClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      // text-ui-* 是字号而不是 text color；显式注册，避免和 text-foreground 等颜色类互相覆盖。
      "font-size": [
        "text-ui-xl",
        "text-ui-lg",
        "text-ui-base",
        "text-ui-caption",
        "text-ui-sm",
        "text-ui-xs",
        "text-mobile-input-safe",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return mergeUiClasses(clsx(inputs));
}

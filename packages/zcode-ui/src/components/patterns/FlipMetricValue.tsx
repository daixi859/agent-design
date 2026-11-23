import { useMemo } from "react";

import { cn } from "../../lib/cn";

/**
 * ZCode 的 FlipMetricValue 逐字符翻页依赖 motion/react（AnimatePresence）；
 * 本包只复刻版式：固定槽宽（数字 0.66em / 冒号 0.34em / 其他 0.7em）与字符槽居中，数字直接渲染不翻页。
 */

const FLIP_TRANSITION = {
  duration: 0.16,
  ease: [0.4, 0, 0.2, 1],
} as const;

/** 翻页过渡参数随组件导出，消费方接 motion 时可复用同一拍。 */
export const flipMetricTransition = FLIP_TRANSITION;

function isDigitCharacter(character: string) {
  return /^[0-9]$/.test(character);
}

function getCharacterWidthClass(character: string) {
  if (isDigitCharacter(character)) {
    return "w-[0.66em]";
  }
  if (character === ":" || character === ".") {
    return "w-[0.34em]";
  }
  return "w-[0.7em]";
}

export type FlipMetricValueProps = {
  value: string;
  className?: string;
};

function MetricCharacter({ character, index }: { character: string; index: number }) {
  const widthClass = getCharacterWidthClass(character);

  // 数字槽以前用 baseline + 负偏移，冒号和 K/M 单位走静态 inline，
  // 混排时视觉中线不一致；所有字符统一固定高度并居中（ZCode 注释）。
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[1.15em] shrink-0 items-center justify-center leading-none",
        widthClass,
      )}
      key={`${index}-${character}`}
    >
      {character}
    </span>
  );
}

export function FlipMetricValue({ value, className }: FlipMetricValueProps) {
  const characters = useMemo(() => Array.from(value), [value]);

  return (
    <span
      role="status"
      aria-label={value}
      className={cn("inline-flex items-center tabular-nums", className)}
    >
      {characters.map((character, index) => (
        <MetricCharacter
          character={character}
          index={index}
          key={`${index}-${character}`}
        />
      ))}
    </span>
  );
}
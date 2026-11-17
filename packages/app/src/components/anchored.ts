// 锚定浮层的公共放置几何（MenuSurface / Tooltip / HoverCard 共用）：
// 打开瞬间的锚矩形快照 → fixed 定位样式。水平左缘对齐锚左缘并夹进视口；
// 垂直按 placement 贴锚（top = 锚上方，bottom = 锚下方）。
// 快照定位是刻意取舍：浮层存活期内不追踪锚移动（composer 钉在视口底部，基本不动），
// 换来零测量零抖动；视口 resize 时由消费方重放。
import type { CSSProperties } from "react";

const EDGE_GAP = 8;
const ANCHOR_GAP = 6;

export function placeFixed(
  rect: DOMRect,
  placement: "top" | "bottom",
  opts: { width?: number; maxWidth?: number } = {},
): CSSProperties {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const maxWidth = opts.maxWidth ?? Math.min(320, viewportWidth - EDGE_GAP * 2);
  const left = Math.min(Math.max(EDGE_GAP, rect.left), viewportWidth - EDGE_GAP - maxWidth);
  const base: CSSProperties = { left, maxWidth, ...(opts.width ? { width: opts.width } : {}) };
  return placement === "top"
    ? { ...base, bottom: viewportHeight - rect.top + ANCHOR_GAP }
    : { ...base, top: rect.bottom + ANCHOR_GAP };
}

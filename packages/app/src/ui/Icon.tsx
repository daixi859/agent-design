/**
 * SF Symbols 风格描边图标集（Q12：原生骨架）。
 * 统一 20×20 viewBox、1.6 描边、圆头圆角，跟随 currentColor。
 */
import type { JSX } from "react";

export type IconName =
  | "panel-left"
  | "plus"
  | "search"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "arrow-down"
  | "arrow-up"
  | "sun"
  | "moon"
  | "branch"
  | "sparkles"
  | "wrench"
  | "terminal"
  | "doc"
  | "pencil"
  | "folder"
  | "folder-open"
  | "warning"
  | "play"
  | "pause"
  | "xmark"
  | "gear"
  | "expand"
  | "contract"
  | "arrow-left";

const glyphs: Record<IconName, JSX.Element> = {
  "panel-left": (
    <>
      <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2.75" />
      <path d="M7.75 4.5v11" />
    </>
  ),
  plus: <path d="M10 4.75v10.5M4.75 10h10.5" />,
  search: (
    <>
      <circle cx="9" cy="9" r="4.25" />
      <path d="m12.3 12.3 3.45 3.45" />
    </>
  ),
  "chevron-left": <path d="m12 5.5-4.5 4.5 4.5 4.5" />,
  "chevron-right": <path d="m8 5.5 4.5 4.5L8 14.5" />,
  "chevron-down": <path d="M5.5 8l4.5 4.5L14.5 8" />,
  "arrow-down": <path d="M10 4.5v10m0 0-4-4m4 4 4-4" />,
  "arrow-up": <path d="M10 15.5v-10m0 0-4 4m4-4 4 4" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.75v1.75M10 15.5v1.75M2.75 10H4.5M15.5 10h1.75M4.95 4.95l1.25 1.25M13.8 13.8l1.25 1.25M15.05 4.95 13.8 6.2M6.2 13.8l-1.25 1.25" />
    </>
  ),
  moon: <path d="M15.8 12.3a6.3 6.3 0 0 1-8.1-8.1 6.5 6.5 0 1 0 8.1 8.1Z" />,
  branch: (
    <>
      <circle cx="5.75" cy="5" r="1.75" />
      <circle cx="5.75" cy="15" r="1.75" />
      <circle cx="14.25" cy="6.5" r="1.75" />
      <path d="M5.75 6.75v6.5M14.25 8.25c0 2.5-2.1 3.75-5 3.75H8" />
    </>
  ),
  sparkles: (
    <>
      <path d="M8.5 3.5l1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3z" />
      <path d="M14.75 12.25l.7 1.95 1.95.7-1.95.7-.7 1.95-.7-1.95-1.95-.7 1.95-.7z" />
    </>
  ),
  wrench: (
    <>
      <path d="M13.75 3.6a4.5 4.5 0 0 0-4.9 6.5l-5.25 5.3a1.9 1.9 0 1 0 2.7 2.7l5.3-5.25a4.5 4.5 0 0 0 6.5-4.9l-2.9 2.9-2.5-.35-.35-2.5z" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="14" height="11" rx="2.25" />
      <path d="m6.5 8 2.25 2.25L6.5 12.5M11 12.5h3" />
    </>
  ),
  doc: (
    <>
      <path d="M6.5 2.75h4.75l3.75 3.75V16.5a.75.75 0 0 1-.75.75H6.5a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" />
      <path d="M11.25 3v3.5h3.75M8.5 11h3.5M8.5 14h3.5" />
    </>
  ),
  pencil: (
    <>
      <path d="m4.5 15.75.85-3.05 7.8-7.8a1.65 1.65 0 0 1 2.33 2.33l-7.8 7.8-3.18.72Z" />
      <path d="m12.5 5.55 2.3 2.3" />
    </>
  ),
  folder: (
    <>
      <path d="M3.25 14.75v-8.5c0-.97.78-1.75 1.75-1.75h2.9l1.7 1.75h5.4c.97 0 1.75.78 1.75 1.75v6.75c0 .97-.78 1.75-1.75 1.75H5c-.97 0-1.75-.78-1.75-1.75Z" />
    </>
  ),
  "folder-open": (
    <>
      {/* 后盖短边：盖口在上一半，表达「打开」 */}
      <path d="M3.25 6.25c0-.97.78-1.75 1.75-1.75h2.9l1.7 1.75h5.4c.97 0 1.75.78 1.75 1.75V9" />
      {/* 前板：左上斜切口 + 右侧倾斜底缘 */}
      <path d="M3.25 14.5v-8l2.06 3.1h10.4c1.35 0 2.3 1.3 1.92 2.6l-.9 3.1a2 2 0 0 1-1.92 1.45H5.25c-1.1 0-2-.9-2-2.25Z" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3.75 17 15.5a.6.6 0 0 1-.52.9H3.52a.6.6 0 0 1-.52-.9Z" />
      <path d="M10 8.25v3M10 13.6h.01" />
    </>
  ),
  xmark: <path d="m5.5 5.5 9 9m0-9-9 9" />,
  play: <path d="M7.4 4.9v10.2L15.8 10Z" />,
  pause: <path d="M7.4 5v10M12.6 5v10" />,
  /* 滑杆式设置（SF slider.horizontal.3）：三滑轨 + 错位旋钮 */
  gear: (
    <>
      <path d="M3 5.75h7M13.5 5.75H17M3 10h3M9.5 10H17M3 14.25h8M14.5 14.25H17" />
      <circle cx="11.75" cy="5.75" r="1.75" />
      <circle cx="7.75" cy="10" r="1.75" />
      <circle cx="12.75" cy="14.25" r="1.75" />
    </>
  ),
  /* 全屏进出：对角双箭头，外撑 / 内收 */
  expand: (
    <>
      <path d="M13.25 6.75l3.5-3.5M16.75 6.75V3.25h-3.5" />
      <path d="M6.75 13.25l-3.5 3.5M3.25 13.25v3.5h3.5" />
    </>
  ),
  contract: (
    <>
      <path d="M16.75 3.25 13.25 6.75M13.25 3.25v3.5h3.5" />
      <path d="M3.25 16.75l3.5-3.5M3.25 13.25v3.5h3.5" />
    </>
  ),
  "arrow-left": <path d="M16.5 10h-13m0 0 4.25-4.25M3.5 10l4.25 4.25" />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}

/** 图标全名单（Preview 页网格用，随 glyphs 自动同步） */
export const ICON_NAMES = Object.keys(glyphs) as IconName[];

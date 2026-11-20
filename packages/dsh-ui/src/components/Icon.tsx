/**
 * SF Symbols 风格描边图标集（dsh-ui 子集）：自 app/src/components/Icon.tsx 摘取
 * 两页样张与壳所需的字形，几何与全集逐项一致（20×20 viewBox、1.6 描边、currentColor）。
 */
import type { JSX } from "react";

export type IconName =
  | "check"
  | "sun"
  | "moon"
  | "branch"
  | "search"
  | "plus"
  | "gear"
  | "doc"
  | "pencil"
  | "xmark"
  | "warning"
  | "chevron-down"
  | "wrench"
  | "terminal";

const glyphs: Record<IconName, JSX.Element> = {
  check: <path d="m4.75 10.75 3.75 3.75 6.75-8" />,
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
  search: (
    <>
      <circle cx="9" cy="9" r="4.25" />
      <path d="m12.3 12.3 3.45 3.45" />
    </>
  ),
  plus: <path d="M10 4.75v10.5M4.75 10h10.5" />,
  gear: (
    <>
      <path d="M3 5.75h7M13.5 5.75H17M3 10h3M9.5 10H17M3 14.25h8M14.5 14.25H17" />
      <circle cx="11.75" cy="5.75" r="1.75" />
      <circle cx="7.75" cy="10" r="1.75" />
      <circle cx="12.75" cy="14.25" r="1.75" />
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
  xmark: <path d="m5.5 5.5 9 9m0-9-9 9" />,
  warning: (
    <>
      <path d="M10 3.75 17 15.5a.6.6 0 0 1-.52.9H3.52a.6.6 0 0 1-.52-.9Z" />
      <path d="M10 8.25v3M10 13.6h.01" />
    </>
  ),
  "chevron-down": <path d="M5.5 8l4.5 4.5L14.5 8" />,
  wrench: (
    <path d="M13.75 3.6a4.5 4.5 0 0 0-4.9 6.5l-5.25 5.3a1.9 1.9 0 1 0 2.7 2.7l5.3-5.25a4.5 4.5 0 0 0 6.5-4.9l-2.9 2.9-2.5-.35-.35-2.5z" />
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="14" height="11" rx="2.25" />
      <path d="m6.5 8 2.25 2.25L6.5 12.5M11 12.5h3" />
    </>
  ),
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

/** Tooltip：轻文本悬浮提示（GLOSSARY「Base Component」）。350ms 意图延迟，
    锚上/下方贴锚弹出；纯短文案用，富内容用 HoverCard。
    包裹层 inline-flex（不用 display:contents——不生成盒子的元素量不出矩形）。 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeFixed } from "./anchored";
import styles from "./tooltip.module.css";

const SHOW_DELAY_MS = 350;

export function Tooltip({
  label,
  placement = "top",
  children,
}: {
  label: ReactNode;
  placement?: "top" | "bottom";
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const show = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) setStyle(placeFixed(rect, placement, { maxWidth: 280 }));
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStyle(null);
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <span
      ref={anchorRef}
      className={styles.anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {style !== null &&
        createPortal(
          <span className={styles.tip} style={style} role="tooltip">
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

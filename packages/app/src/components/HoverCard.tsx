/** HoverCard：富内容悬浮卡（GLOSSARY「Base Component」）。250ms 意图延迟出现；
    指针进卡续命、离开锚与卡 250ms 后收——Context Ring 的 hover 详情是首个消费者。 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeFixed } from "./anchored";
import styles from "./hover-card.module.css";

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 250;

export function HoverCard({
  content,
  placement = "top",
  maxWidth = 260,
  children,
}: {
  content: ReactNode;
  placement?: "top" | "bottom";
  maxWidth?: number;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const clearShow = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };
  const clearHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleShow = () => {
    clearHide();
    if (showTimer.current !== null || style !== null) return;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) setStyle(placeFixed(rect, placement, { maxWidth }));
    }, SHOW_DELAY_MS);
  };
  const scheduleHide = () => {
    clearShow();
    if (hideTimer.current !== null) return;
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setStyle(null);
    }, HIDE_DELAY_MS);
  };

  useEffect(
    () => () => {
      clearShow();
      clearHide();
    },
    // 清理只关心卸载，依赖恒定
    [],
  );

  return (
    <span
      ref={anchorRef}
      className={styles.anchor}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      {children}
      {style !== null &&
        createPortal(
          <div
            ref={cardRef}
            className={styles.card}
            style={style}
            onMouseEnter={clearHide}
            onMouseLeave={scheduleHide}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

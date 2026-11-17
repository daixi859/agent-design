/** MenuSurface：锚定浮层表面原语（GLOSSARY「Base Component」）。portal 到 body、
    锚矩形快照定位（placement top/bottom）、锚外 pointerdown 即关。
    列表语义（listbox / option / aria-activedescendant）由消费方搭建，本组件只管
    表面、放置与关闭；Esc 由消费方统一仲裁（Composer 的双击 Esc 中断不得与
    「先关浮层」抢拍——Trigger Menu 传 closeOnEscape=false，自管键盘）。
    上层菜单行样式（menu-surface.module.css 的 item 族）随本原语一同交付。 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeFixed } from "./anchored";
import styles from "./menu-surface.module.css";

export function MenuSurface({
  anchor,
  anchorEl,
  placement = "bottom",
  onClose,
  closeOnEscape = true,
  matchAnchorWidth = false,
  maxHeight = 400,
  ariaLabel,
  children,
}: {
  /** 打开瞬间的锚矩形快照（getBoundingClientRect） */
  anchor: DOMRect;
  /** 锚元素（触发钮 / composer 卡）：其内部的 pointerdown 不触发关闭——
      保住触发钮的 toggle 语义与输入连续性（dsh：菜单与 composer 卡之外才算「外点」） */
  anchorEl?: Element | null;
  placement?: "top" | "bottom";
  onClose(): void;
  closeOnEscape?: boolean;
  matchAnchorWidth?: boolean;
  maxHeight?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(() => placeFixed(anchor, placement, opts(anchor, matchAnchorWidth)));

  useLayoutEffect(() => {
    const reflow = () => setStyle(placeFixed(anchor, placement, opts(anchor, matchAnchorWidth)));
    reflow();
    window.addEventListener("resize", reflow);
    return () => window.removeEventListener("resize", reflow);
  }, [anchor, placement, matchAnchorWidth]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (surfaceRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorEl, onClose]);

  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // capture 抢先于 Composer 的双击 Esc 仲裁：这里消掉事件，不让它计入口令
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeOnEscape, onClose]);

  return createPortal(
    // 有具名语义时用 group（presentation 会剥掉 label，等于白标）；列表语义由
    // 消费方的 listbox/option 承载，本组件只当容器
    <div
      ref={surfaceRef}
      className={styles.surface}
      style={style}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      data-menu-surface=""
    >
      <div className={styles.scroll} style={{ maxHeight }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** MenuSurface 的元素查询钩子：Composer 的 Esc 仲裁用它判断「有无浮层在场」。
    单页单 composer，查询是全量的也没有歧义。 */
export function hasOpenMenuSurface(): boolean {
  return document.querySelector("[data-menu-surface]") !== null;
}

function opts(anchor: DOMRect, matchAnchorWidth: boolean): { width?: number } {
  return matchAnchorWidth ? { width: anchor.width } : {};
}

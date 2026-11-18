/** MenuSurface：锚定浮层表面原语（GLOSSARY「Base Component」）。包裹触发元素——
    trigger 渲染参数持有其 ref，打开瞬间快照锚矩形定位（placement top/bottom），
    锚外 pointerdown 即关。列表语义（listbox / option / aria-activedescendant）由
    消费方搭建，Group / Item 只供分组头与行插槽；Esc 由消费方统一仲裁（Composer
    的双击 Esc 中断不得与「先关浮层」抢拍——Trigger Menu 传 closeOnEscape=false，
    自管键盘）。定位走脚本快照路径（anchored.ts）——CSS 锚定位尚未基线化（Firefox
    缺位），脚本定位是 guide 认可的 fallback 路径，且零测量零抖动是既有取舍。
    上层菜单行样式（menu-surface.module.css 的 item 族）随本原语一同交付。 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { EDGE_GAP, placeFixed } from "./anchored";
import styles from "./menu-surface.module.css";

export function MenuSurface<E extends HTMLElement = HTMLElement>({
  open,
  onClose,
  placement = "bottom",
  matchAnchorWidth = false,
  closeOnEscape = true,
  maxHeight = 400,
  ariaLabel,
  trigger,
  children,
}: {
  /** 受控开关：触发元素的点击语义留在消费方（toggle 钮 / combobox 皆可） */
  open: boolean;
  onClose(): void;
  /** 包裹的触发元素：打开瞬间按它的矩形定位，matchAnchorWidth 时同宽 */
  trigger(anchorRef: RefObject<E | null>): ReactNode;
  placement?: "top" | "bottom";
  matchAnchorWidth?: boolean;
  closeOnEscape?: boolean;
  maxHeight?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const anchorRef = useRef<E | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  // 开关沿快照锚矩形（快照定位是刻意取舍：浮层存活期内不追踪锚移动，换零抖动）
  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      setStyle(null);
      return;
    }
    const rect = anchorRef.current?.getBoundingClientRect() ?? null;
    setAnchor(rect);
    setStyle(rect ? placeFixed(rect, placement, rectOpts(rect, matchAnchorWidth)) : null);
  }, [open, placement, matchAnchorWidth]);

  // 视口 resize 重放（快照定位的消费方义务，收敛在本组件）
  useEffect(() => {
    if (!anchor) return;
    const reflow = () => setStyle(placeFixed(anchor, placement, rectOpts(anchor, matchAnchorWidth)));
    reflow();
    window.addEventListener("resize", reflow);
    return () => window.removeEventListener("resize", reflow);
  }, [anchor, placement, matchAnchorWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (surfaceRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!closeOnEscape || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // capture 抢先于 Composer 的双击 Esc 仲裁：这里消掉事件，不让它计入口令
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeOnEscape, open, onClose]);

  return (
    <>
      {trigger(anchorRef)}
      {open && anchor && style &&
        createPortal(
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
        )}
    </>
  );
}

/** MenuSurface 的元素查询钩子：Composer 的 Esc 仲裁用它判断「有无浮层在场」。
    单页单 composer，查询是全量的也没有歧义。 */
export function hasOpenMenuSurface(): boolean {
  return document.querySelector("[data-menu-surface]") !== null;
}

/** 分组：分割线式组头 + 行集合。组头走 eyebrow 口径（短分割线 — 名称 — 通栏）；
    组的列表语义由行的 role 承载（role="group" + aria-label 是 listbox 分组的
    合法结构），本组件不发明键盘交互 */
export function MenuSurfaceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className={styles.groupLabel}>{label}</div>
      {children}
    </div>
  );
}

/** 行插槽：前导图标槽（有图标才占位——单菜单内行样式同源，不混排）、主体插槽
    （标题/描述自由搭）、行尾插槽（✓ 之类，推向行内末端）。语义与键盘事件
    （role / onMouseDown / ref 等）由消费方透过按钮原生 props 传入——
    选择模型（click 接管）与命令菜单（mousedown 接管保焦点）两种口径都装得下 */
export function MenuSurfaceItem({
  selected,
  icon,
  trailing,
  children,
  ...rest
}: {
  selected?: boolean;
  icon?: IconName;
  trailing?: ReactNode;
  children: ReactNode;
} & ComponentPropsWithRef<"button">) {
  return (
    <button type="button" aria-selected={selected} className={styles.item} {...rest}>
      {icon && (
        <span className={styles.itemIcon}>
          <Icon name={icon} size={13} />
        </span>
      )}
      <span className={styles.itemBody}>{children}</span>
      {trailing != null && <span className={styles.itemTrailing}>{trailing}</span>}
    </button>
  );
}

function rectOpts(anchor: DOMRect, matchAnchorWidth: boolean): { width?: number; maxWidth?: number } {
  if (!matchAnchorWidth) return {};
  // 同宽口径连上限一并对齐锚：placeFixed 的默认 320 上限会把 width 压扁（弹窗从未真正同宽）
  return {
    width: anchor.width,
    maxWidth: Math.min(anchor.width, window.innerWidth - EDGE_GAP * 2),
  };
}

/** 基础按钮（Base Component，见 GLOSSARY）：ghost 配方单一形态，icon 槽位承载图标；
 *  只有 icon 无 children 时自动挂 .square 成方形控件——原 IconButton 即此形态，
 *  专用形态不再单独立组件，用组合表达（icon 槽位 / 文字 / 图标+文字）。
 *  视觉配方引用语义层令牌（ADR-0001）。 */
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./button.module.css";
import { cx } from "../lib/cx";

export function Button({
  icon,
  children,
  className,
  ...rest
}: { icon?: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        styles.button,
        icon != null && children == null ? styles.square : styles.text,
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

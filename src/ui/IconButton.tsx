import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./controls.module.css";
import { cx } from "../lib/cx";

export function IconButton({
  icon,
  className,
  ...rest
}: { icon: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx(styles.iconButton, className)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

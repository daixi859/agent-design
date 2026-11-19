/** 空态 / 阻断态（Base Component，见 GLOSSARY）：居中一列的图标、标题、说明与动作槽位。
 *  骨架单一形态，字号与动作由调用方经 className / titleClassName 与 children 表达——
 *  组件不认识「某个页面的空态」，也不以元素选择器穿透槽位内部。
 *  视觉配方引用语义层令牌（ADR-0001）。 */
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "../lib/cx";
import styles from "./empty-state.module.css";

export function EmptyState({
  icon,
  title,
  hint,
  className,
  titleClassName,
  children,
}: {
  icon: IconName;
  title?: ReactNode;
  hint?: ReactNode;
  /** 根类名槽位（如整页态加页边距） */
  className?: string;
  /** 标题类名槽位（如整页阻断要提一档字号） */
  titleClassName?: string;
  /** 动作区（如重试按钮），渲染在说明之后 */
  children?: ReactNode;
}) {
  return (
    <div className={cx(styles.emptyState, className)}>
      <Icon name={icon} size={28} className={styles.icon} />
      {title != null && <strong className={cx(styles.title, titleClassName)}>{title}</strong>}
      {hint != null && <span>{hint}</span>}
      {children != null && <div className={styles.action}>{children}</div>}
    </div>
  );
}

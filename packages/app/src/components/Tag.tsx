/** Tag：弱化行内徽标（Base Component，见 GLOSSARY）——短文本标记（能力 / 状态词），
 *  无业务语义：文案与 title 提示由消费方给；行内混排（选择器行尾徽标等）随用随嵌。
 *  视觉配方引用语义层令牌（ADR-0001）。 */
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./tag.module.css";

export function Tag({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={cx(styles.tag, className)} title={title}>
      {children}
    </span>
  );
}

/** Tag：行内徽标（Base Component，见 GLOSSARY）——短文本标记（能力 / 状态词），
 *  无业务语义：文案与 title 提示由消费方给；行内混排（选择器行尾徽标等）随用随嵌。
 *  pill 形态承载胶囊一族（Session Bar 徽标 / Command Chip / 驱动状态）：
 *  tone 定底色与字色档；自带差异的消费方类确定性覆写 :where 配方（同 Button 基座
 *  模式）。可交互胶囊不经本组件（aria/ref 语义留在原生 button），走 composes。
 *  视觉配方引用语义层令牌（ADR-0001）。 */
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import styles from "./tag.module.css";

export type TagTone = "neutral" | "accent" | "success" | "elevated";

const TONE_CLASS: Record<TagTone, string> = {
  neutral: styles.toneNeutral,
  accent: styles.toneAccent,
  success: styles.toneSuccess,
  elevated: styles.toneElevated,
};

export function Tag({
  children,
  title,
  className,
  tone = "neutral",
  pill = false,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  /** 色调档：中性（inset 底）/ 强调（accent-subtle）/ 成功（success-subtle）/ 浮面（elevated） */
  tone?: TagTone;
  /** 胶囊形态（radius-pill + caption2 密集内边距）：徽标一族的标准几何 */
  pill?: boolean;
}) {
  return (
    <span
      className={cx(pill ? styles.pill : styles.tag, TONE_CLASS[tone], className)}
      title={title}
    >
      {children}
    </span>
  );
}

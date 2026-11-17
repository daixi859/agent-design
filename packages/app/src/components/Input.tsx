/** 基础输入（Base Component，见 GLOSSARY）：label 包裹的输入，属性全透传；
 *  leading 槽位承载前置图标——原 SearchField 即 Input + search 图标的组合，
 *  专用形态不再单独立组件。聚焦态由容器描边表达（input.module.css）。 */
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./input.module.css";
import { cx } from "../lib/cx";

export function Input({
  leading,
  className,
  ...rest
}: { leading?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx(styles.input, className)}>
      {leading}
      <input
        spellCheck={false}
        autoComplete="off"
        {...rest}
      />
    </label>
  );
}

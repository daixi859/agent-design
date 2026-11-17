/** 整行 disclosure 行头（ADR-0013 的 Recap 行 / 工具行头共用形态，迭代修订）。
 *
 *  语义上是「一行」而不是「一个按钮」：用 div + role="button" 承载，不用原生 button——
 *  原生按钮的默认内边距、居中排版与 inline-block 宽度与「贯穿整行、左缘与正文齐平」的
 *  几何相冲，逐条 padding:0 / width:100% 抹掉只是把按钮的外观改回 div，元素语义反而绕。
 *  交互契约照旧：点击与 Enter / Space 同效，展开态由调用方写 aria-expanded；
 *  焦点环走 global.css 的 :focus-visible（div 可聚焦靠 tabIndex）。
 */
import type { ReactNode } from "react";

export function DisclosureRow({
  className,
  open,
  onClick,
  title,
  children,
}: {
  className?: string;
  /** 展开态：写入 aria-expanded，读屏可辨 */
  open: boolean;
  onClick: () => void;
  /** 悬停提示（原 button 的 title 行为） */
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      aria-expanded={open}
      title={title}
      onClick={onClick}
      onKeyDown={(event) => {
        // Enter / Space 与点击同效（原生 button 的键盘约定）；
        // 长按时浏览器会连发 repeat keydown——原生 button 只触发一次，这里同样只认首次
        if (event.repeat) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

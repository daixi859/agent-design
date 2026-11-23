// 把 Tailwind v4 默认的 dark: 变体（prefers-color-scheme 媒体查询）改成类协议：
// &:where(.dark, .dark *)。ZCode 用 <html> 上的 .dark 类切明暗（useTheme.ts），
// 组件类名里的 dark:* 必须按类匹配才能随主题切换。
export default function darkClassVariant({ addVariant }) {
  addVariant("dark", "&:where(.dark, .dark *)");
}

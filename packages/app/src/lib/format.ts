/** 轻量格式化：全部用原生 Intl / 手写紧凑格式，不引第三方库（Q18）。
 *  两渲染形态（Standard / TUI）的呈现格式化唯一实现：clock / date / tokens / duration
 *  都在这里，组件不再自留同名本地版（C4 收编——原 formatClock 硬编码 en 的 locale
 *  缺陷随收编修复）。 */
import type { Locale } from "./i18n";

const localeFmts: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }),
  zh: new Intl.DateTimeFormat("zh", { month: "numeric", day: "numeric" }),
};

/** Sidebar 副行的紧凑相对时间：now / 5m / 2h / 3d / Nov 12（zh：刚刚 / 5分钟 / 2小时 / 3天 / 11月12日） */
export function formatRelativeCompact(
  iso: string,
  locale: Locale = "en",
  now = Date.now(),
): string {
  const t = Date.parse(iso);
  const diffSeconds = Math.round((t - now) / 1000);
  const past = Math.abs(diffSeconds);
  if (past < 45) return locale === "zh" ? "刚刚" : "now";
  const minutes = Math.round(past / 60);
  if (minutes < 60) return locale === "zh" ? `${minutes}分钟` : `${minutes}m`;
  const hours = Math.round(past / 3600);
  if (hours < 24) return locale === "zh" ? `${hours}小时` : `${hours}h`;
  const days = Math.round(past / 86400);
  if (days < 7) return locale === "zh" ? `${days}天` : `${days}d`;
  return localeFmts[locale].format(t);
}

/** 时刻（毫秒锚）：`1:56 PM`（zh：`下午1:56`）——TUI 汇总行 done 段 */
export function formatClockAt(at: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(at);
}

/** 时刻（ISO 版用户气泡时钟壳）：解析失败回 undefined，不显示 "Invalid Date" */
export function formatClock(iso: string, locale: Locale = "en"): string | undefined {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? formatClockAt(at, locale) : undefined;
}

/** 日期（毫秒锚）：`11/17`（zh：`11/17`）——TUI 汇总行 done 段的月/日 */
export function formatDateAt(at: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(at);
}

/** tokens 紧凑记数：Intl compact（en `1.2K` / `3.4M`，zh 万进制）——Recap / Context Ring /
 *  注解行同口径的唯一实现 */
export function formatTokens(n: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 文件大小（Live Tail 提示用） */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 耗时：不足一秒报毫秒；秒制固定一位小数（20.0s，读秒的展示精度，整秒也补 .0）；
    满一分钟（按秒四舍五入后进位，避免闪现 60.0s）报分秒且秒取整（1m14s）——
    TurnView（Standard）与 TuiGroup（TUI）同口径消费的唯一实现 */
export function formatDuration(ms: number, locale: Locale | string): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(ms / 1000)}s`;
  }
  return `${Math.floor(totalSeconds / 60)}m${totalSeconds % 60}s`;
}

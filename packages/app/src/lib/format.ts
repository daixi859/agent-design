/** 轻量格式化：全部用原生 Intl / 手写紧凑格式，不引第三方库（Q18） */

const localeFmts: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }),
  zh: new Intl.DateTimeFormat("zh", { month: "numeric", day: "numeric" }),
};

/** Sidebar 副行的紧凑相对时间：now / 5m / 2h / 3d / Nov 12（zh：刚刚 / 5分钟 / 2小时 / 3天 / 11月12日） */
export function formatRelativeCompact(
  iso: string,
  locale: "en" | "zh" = "en",
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

/** Transcript 内的绝对时间：14:32 */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    Date.parse(iso),
  );
}

/** 1.2k / 3.4M */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
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
export function formatDuration(ms: number, locale: string): string {
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

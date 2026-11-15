/** 轻量格式化：全部用原生 Intl / 手写紧凑格式，不引第三方库（Q18） */

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** Sidebar 副行的紧凑相对时间：now / 5m / 2h / 3d / Nov 12 */
export function formatRelativeCompact(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const diffSeconds = Math.round((t - now) / 1000);
  const past = Math.abs(diffSeconds);
  if (past < 45) return "now";
  const minutes = Math.round(past / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(past / 3600);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(past / 86400);
  if (days < 7) return `${days}d`;
  return dayFmt.format(t);
}

/** Transcript 内的绝对时间：14:32 */
export function formatClock(iso: string): string {
  return timeFmt.format(Date.parse(iso));
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

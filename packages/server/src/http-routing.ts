/** HTTP 路由的纯函数（被 main.ts 与测试共用）。
    单独成文件的原因：main.ts 在导入时就会 listen，测试无法导入它；
    而这里的两条重写规则曾经各自静默出错过一次（丢掉 ?offset= → Live Tail 每轮全量重放）。 */

/** /api 前缀剥离：pi-data 按 connect 语义写成「已剥前缀」的路由。
    必须保留 query——Live Tail 的 ?offset= 就在这里，丢了会从文件头全量重放。 */
export function stripApiPrefix(rawUrl: string): string | undefined {
  const url = new URL(rawUrl, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return undefined;
  return url.pathname.slice(4) + url.search;
}

/** 静态资源的 URL → 磁盘相对路径："/" 映射到 index.html，其余原样 */
export function staticRelPath(pathname: string): string {
  return pathname === "/" ? "/index.html" : pathname;
}

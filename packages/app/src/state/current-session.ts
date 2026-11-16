/** 「当前 Session」的 URL 契约唯一声明：/session/:id。
    MainShell 是唯一消费方——原 SessionView 的 useParams 与 SessionBar 的手写正则由此收拢。 */

/** 从 pathname 提取当前 Session id；非 session 路由返回 undefined */
export function currentSessionId(pathname: string): string | undefined {
  return /^\/session\/([^/]+)/.exec(pathname)?.[1];
}

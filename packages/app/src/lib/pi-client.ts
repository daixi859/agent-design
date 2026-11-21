/** Pi 数据 API 的类型化 fetch 客户端（浏览路径只读，ADR-0002；取数可注入，ADR-0019 ②） */
import type {
  SessionDetail,
  SessionsResponse,
  TailResponse,
} from "@pi-studio/shared/pi-types";
import type { GlobalCatalog } from "@pi-studio/shared/protocol";

/** 取数缝（ADR-0019 ②）：桌面壳注入经桥走自定义协议的适配件，浏览器形态走缺省 */
export type ApiFetch = (path: string) => Promise<Response>;

/** 缺省取数：相对路径打浏览器 fetch。惰性求值——模块顶层不得取 window.fetch，
    否则 node / SSR 环境一导入就炸；以 window 为 this 调用，避开「非法调用」类错误 */
const browserFetch: ApiFetch = (path) => window.fetch(path);

let fetcher: ApiFetch = browserFetch;

/** 换取数器（ADR-0019 ②）：传 undefined 恢复缺省（浏览器 fetch），测试与桌面退出用 */
export function configureFetch(next: ApiFetch | undefined): void {
  fetcher = next ?? browserFetch;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetcher(path);
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const fetchSessions = () => get<SessionsResponse>("/api/sessions");

export const fetchSession = (id: string) =>
  get<SessionDetail>(`/api/session/${encodeURIComponent(id)}`);

export const tailSession = (id: string, offset: number) =>
  get<TailResponse>(`/api/session/${encodeURIComponent(id)}/tail?offset=${offset}`);

/** 全局模型目录（ADR-0012 补记十四）：浏览态 Model Seat 的兜底菜单源 */
export const fetchCatalog = () => get<GlobalCatalog>("/api/catalog");

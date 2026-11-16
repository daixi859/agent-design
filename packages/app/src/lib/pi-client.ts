/** Pi 数据 API 的类型化 fetch 客户端（只读，ADR-0002） */
import type {
  SessionDetail,
  SessionsResponse,
  TailResponse,
} from "@pi-studio/shared/pi-types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
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

/** Session 列表状态：按 Project 分组（Q16） */
import { useCallback, useEffect, useState } from "react";
import type { SessionSummary } from "@pi-studio/shared/pi-types";
import { fetchSessions } from "../lib/pi-client";

export interface ProjectGroup {
  projectPath: string;
  projectName: string;
  /** 组内已按 lastActiveAt 倒序（服务端排好） */
  sessions: SessionSummary[];
}

export function groupByProject(sessions: SessionSummary[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const session of sessions) {
    let group = groups.get(session.projectPath);
    if (!group) {
      group = { projectPath: session.projectPath, projectName: session.projectName, sessions: [] };
      groups.set(session.projectPath, group);
    }
    group.sessions.push(session);
  }
  // 项目按其最新 session 活跃时间排序
  return [...groups.values()].sort((a, b) =>
    b.sessions[0].lastActiveAt.localeCompare(a.sessions[0].lastActiveAt),
  );
}

export interface SessionsState {
  loading: boolean;
  rootExists: boolean;
  error?: string;
  sessions: SessionSummary[];
  groups: ProjectGroup[];
  /** Live Tail 的活跃依据：mtime 最新的 session（Q17） */
  activeSessionId?: string;
  refresh: () => void;
}

export function useSessions(): SessionsState {
  const [state, setState] = useState<Omit<SessionsState, "refresh" | "groups" | "activeSessionId">>({
    loading: true,
    rootExists: true,
    sessions: [],
  });

  const refresh = useCallback(() => {
    fetchSessions()
      .then((data) =>
        setState({
          loading: false,
          rootExists: data.rootExists,
          error: undefined,
          sessions: data.sessions,
        }),
      )
      .catch((error: unknown) =>
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })),
      );
  }, []);

  useEffect(refresh, [refresh]);

  // 列表每 5s 轻刷新一次：Live 圆点与相对时间保持新鲜
  useEffect(() => {
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    ...state,
    groups: groupByProject(state.sessions),
    activeSessionId: state.sessions[0]?.id,
    refresh,
  };
}

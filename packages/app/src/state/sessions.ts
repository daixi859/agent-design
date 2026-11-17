/** Session 列表状态：按 Project 分组（Q16）。
    状态壳（ADR-0015）：列表与轮询住 zustand store，消费端直订，App 不再经 props 中转；
    分组派生留在消费侧（useMemo + groupByProject），store 只存服务端原样数据。 */
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { SessionSummary } from "@pi-studio/shared/pi-types";
import { errorMessage } from "@pi-studio/shared/errors";
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

/** store 切片：服务端原样列表（分组、首条等派生量在消费侧算） */
export interface SessionsState {
  loading: boolean;
  rootExists: boolean;
  error?: string;
  sessions: SessionSummary[];
}

export const sessionsStore = createStore<SessionsState>(() => ({
  loading: true,
  rootExists: true,
  sessions: [],
}));

function refresh(): void {
  fetchSessions()
    .then((data) =>
      sessionsStore.setState({
        loading: false,
        rootExists: data.rootExists,
        error: undefined,
        sessions: data.sessions,
      }),
    )
    .catch((error: unknown) =>
      sessionsStore.setState((prev) => ({ ...prev, loading: false, error: errorMessage(error) })),
    );
}

let timer: number | null = null;

/** 幂等启动首载 + 每 5s 轻刷新（列表与相对时间保持新鲜）；SPA 生命周期内不停。
    启动时机：随首个消费端挂载（Sidebar / Home / MainShell）——与原实现（挂在永不卸载的
    根 App）的差异只在深链直达设置壳时轮询不跑、回主壳才首刷，设置壳不消费此 store */
function ensurePolling(): void {
  if (timer !== null) return;
  refresh();
  timer = window.setInterval(refresh, 5000);
}

/** 整表订阅（Sidebar / Home）；首次挂载顺带确保轮询在跑 */
export function useSessions(): SessionsState {
  useEffect(ensurePolling, []);
  return useStore(sessionsStore, (s) => s);
}

/** 按 id 订阅单个摘要（MainShell 的标题与 attach file 依据）；
    create 出的新会话在下一轮轮询前不进列表，返回 undefined 属预期 */
export function useSessionSummary(id: string | undefined): SessionSummary | undefined {
  useEffect(ensurePolling, []);
  return useStore(sessionsStore, (s) =>
    id ? s.sessions.find((candidate) => candidate.id === id) : undefined,
  );
}

/** 分组派生（Sidebar 消费；useMemo 兜住 5s 轮询的重算频率） */
export function useProjectGroups(): ProjectGroup[] {
  const sessions = useStore(sessionsStore, (s) => s.sessions);
  return useMemo(() => groupByProject(sessions), [sessions]);
}

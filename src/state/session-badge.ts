/** SessionView → Session Bar 的 branched 徽标推送（统计展示已移除，ADR-0009） */
import { createContext, useContext } from "react";

export interface SessionBadge {
  branched?: boolean;
}

export const SessionBadgeContext = createContext<SessionBadge>({});
export const SessionBadgeSetter = createContext<(badge: SessionBadge) => void>(() => {});

export const useSessionBadge = () => useContext(SessionBadgeContext);

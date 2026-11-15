/** Session Bar（ADR-0009）：内容区标题栏——session 标题 + branched 徽标
    （SessionView 经 session-badge 推送）+ 动作区（浏览器全屏、主题切换）。 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { SessionsState } from "../../state/sessions";
import { useSessionBadge } from "../../state/session-badge";
import { useTheme } from "../../state/useTheme";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import styles from "./session-bar.module.css";

export function SessionBar({
  sessions,
  collapsed,
}: {
  sessions: SessionsState;
  /** 侧栏收起时 Brand Float 压在本栏左端，需要让位 */
  collapsed: boolean;
}) {
  const { pathname } = useLocation();
  const badge = useSessionBadge();
  const [theme, setTheme] = useTheme();
  const { t } = useLocale();
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // 浏览器拒绝（如权限策略）时静默，按钮保持原状
      });
    }
  };

  const id = /^\/session\/([^/]+)/.exec(pathname)?.[1];
  const session = sessions.sessions.find((candidate) => candidate.id === id);
  const title = session ? (session.name ?? session.title ?? t("untitledSession")) : "Pi Studio";

  return (
    <header className={cx(styles.bar, collapsed && styles.clearFloat)}>
      <div className={styles.titleGroup}>
        <span className={`ellipsis ${styles.title}`}>{title}</span>
        {badge.branched && (
          <span className={styles.branchedBadge} title={t("branchedTitle")}>
            <Icon name="branch" size={11} />
            {t("branched")}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <IconButton
          icon={fullscreen ? "contract" : "expand"}
          title={fullscreen ? t("exitFullScreen") : t("fullScreen")}
          onClick={toggleFullscreen}
        />
        <IconButton
          icon={theme === "dark" ? "sun" : "moon"}
          title={t("toggleTheme")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </div>
    </header>
  );
}

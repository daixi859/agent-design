/** Session Bar（ADR-0009）：内容区标题栏——title / branched 徽标由 MainShell 派生下发；
    动作区：驱动（Attach/解除 + 状态徽标）、浏览器全屏、主题切换。 */
import { useEffect, useState } from "react";
import type { DriveStatus } from "@pi-studio/shared/protocol";
import { useTheme } from "../../state/useTheme";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import nav from "../../ui/nav.module.css";
import styles from "./session-bar.module.css";

export interface SessionBarAttach {
  attached: boolean;
  status?: DriveStatus;
  onAttach(): void;
  onRelease(): void;
}

export function SessionBar({
  title,
  branched,
  collapsed,
  attach,
}: {
  /** 当前 session 标题（无 session 时为产品名） */
  title: string;
  /** 当前 session 存在被弃分支（MainShell 从 TranscriptModel 派生） */
  branched: boolean;
  /** 侧栏收起时 Brand Float 压在本栏左端，需要让位 */
  collapsed: boolean;
  /** 当前 session 可驱动时由 MainShell 下发（有真实文件路径才有值） */
  attach?: SessionBarAttach;
}) {
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

  return (
    <header className={cx(styles.bar, collapsed && styles.clearFloat)}>
      <div className={styles.titleGroup}>
        <span className={`ellipsis ${nav.barTitle}`}>{title}</span>
        {branched && (
          <span className={styles.branchedBadge} title={t("branchedTitle")}>
            <Icon name="branch" size={11} />
            {t("branched")}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        {attach && (
          <>
            {attach.attached && (
              <span
                className={cx(styles.drivePill, attach.status === "running" && styles.drivePillRunning)}
                title={attach.status === "running" ? t("runningBadge") : attach.status === "retrying" ? t("retryingBadge") : t("detach")}
              >
                <span className={styles.driveDot} />
                {attach.status === "running" ? t("runningBadge") : attach.status === "retrying" ? t("retryingBadge") : t("drivenBadge")}
              </span>
            )}
            <IconButton
              icon={attach.attached ? "xmark" : "play"}
              title={attach.attached ? t("detach") : t("attach")}
              onClick={attach.attached ? attach.onRelease : attach.onAttach}
            />
          </>
        )}
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

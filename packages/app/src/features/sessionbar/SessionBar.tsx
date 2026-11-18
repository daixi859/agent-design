/** Session Bar（ADR-0009）：内容区标题栏——title / branched 徽标由 MainShell 派生下发；
    动作区：驱动状态徽标与解除（ADR-0012 补记十一：接管并入首条发送，仅存解除侧）、
    浏览器全屏、渲染模式快切（ADR-0014）、主题切换。 */
import { useEffect, useState } from "react";
import type { DriveStatus } from "@pi-studio/shared/protocol";
import { useTheme } from "../../state/useTheme";
import { useLocale } from "../../state/useLocale";
import { useViewMode } from "../../state/useViewMode";
import { cx } from "../../lib/cx";
import { driveBadgeKey } from "../../lib/drive-labels";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import nav from "../../components/nav.module.css";
import styles from "./session-bar.module.css";

/** 会话已被本端驱动时由 MainShell 下发（状态徽标 + 解除，GLOSSARY 仅存解除侧）；
    不存在 = 未驱动（接管动作在输入区首条发送） */
export interface SessionBarDrive {
  status?: DriveStatus;
  onRelease(): void;
}

export function SessionBar({
  title,
  branched,
  collapsed,
  drive,
}: {
  /** 当前 session 标题（无 session 时为产品名） */
  title: string;
  /** 当前 session 存在被弃分支（MainShell 从 TranscriptModel 派生） */
  branched: boolean;
  /** 侧栏收起时 Brand Float 压在本栏左端，需要让位 */
  collapsed: boolean;
  /** 当前 session 的解除侧控件（有真实驱动状态才有值） */
  drive?: SessionBarDrive;
}) {
  const [theme, setTheme] = useTheme();
  const [viewMode, setViewMode] = useViewMode();
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

  // 驱动徽标文案只算一次（title 与正文同源；idle 时悬停提示解除动作）
  const badgeText = drive?.status ? t(driveBadgeKey(drive.status)) : undefined;

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
        {drive && (
          <>
            <span
              className={cx(styles.drivePill, drive.status === "running" && styles.drivePillRunning)}
              title={drive.status === "idle" ? t("detach") : badgeText}
            >
              <span className={styles.driveDot} />
              {badgeText}
            </span>
            <Button icon="xmark" title={t("detach")} onClick={drive.onRelease} />
          </>
        )}
        <Button
          icon={fullscreen ? "contract" : "expand"}
          title={fullscreen ? t("exitFullScreen") : t("fullScreen")}
          onClick={toggleFullscreen}
        />
        {/* TUI 渲染模式快切（ADR-0014）：与主题切换同构的单钮循环；激活态 accent-subtle 底 */}
        <Button
          icon="terminal"
          title={t("toggleViewMode")}
          aria-pressed={viewMode === "tui"}
          className={cx(viewMode === "tui" && styles.modeActive)}
          onClick={() => setViewMode(viewMode === "tui" ? "standard" : "tui")}
        />
        <Button
          icon={theme === "dark" ? "sun" : "moon"}
          title={t("toggleTheme")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </div>
    </header>
  );
}

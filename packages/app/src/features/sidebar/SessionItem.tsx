/** Sidebar 里的单个 Session 条目：单行（ADR-0005：不展示模型名） */
import { NavLink } from "react-router";
import type { SessionSummary } from "@pi-studio/shared/pi-types";
import { formatRelativeCompact } from "../../lib/format";
import { useDriveLive } from "../../state/use-drive";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import nav from "../../components/nav.module.css";
import styles from "./sidebar.module.css";

export function SessionItem({ session }: { session: SessionSummary }) {
  const { locale, t } = useLocale();
  // 运行指示（GLOSSARY: Running Indicator）：条目自订驱动状态，不经 props 下传（ADR-0015）；
  // selector 出原始布尔，流式 delta 不触发条目重渲
  const live = useDriveLive(session.id);
  const title = session.name ?? session.title ?? t("untitledSession");
  return (
    <NavLink
      to={`/session/${session.id}`}
      className={({ isActive }) => cx(nav.item, isActive && nav.itemActive)}
      title={title}
    >
      <span className={cx(styles.runningDot, live && styles.runningDotOn)} aria-hidden="true" />
      <span className={cx("ellipsis", styles.itemTitle)}>{title}</span>
      <span className={styles.itemTime}>{formatRelativeCompact(session.lastActiveAt, locale)}</span>
    </NavLink>
  );
}

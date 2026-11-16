/** Sidebar 里的单个 Session 条目：单行（ADR-0005：不展示模型名） */
import { NavLink } from "react-router";
import type { SessionSummary } from "@pi-studio/shared/pi-types";
import { formatRelativeCompact } from "../../lib/format";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import nav from "../../ui/nav.module.css";
import styles from "./sidebar.module.css";

export function SessionItem({
  session,
  live,
}: {
  session: SessionSummary;
  /** 该 session 是否为全库最近活跃（Live Tail 呼吸点，Q17） */
  live: boolean;
}) {
  const { locale, t } = useLocale();
  const title = session.name ?? session.title ?? t("untitledSession");
  return (
    <NavLink
      to={`/session/${session.id}`}
      className={({ isActive }) => cx(nav.item, isActive && nav.itemActive)}
      title={title}
    >
      <span className={cx(styles.liveDot, live && styles.liveDotOn)} aria-hidden="true" />
      <span className={cx("ellipsis", styles.itemTitle)}>{title}</span>
      <span className={styles.itemTime}>{formatRelativeCompact(session.lastActiveAt, locale)}</span>
    </NavLink>
  );
}

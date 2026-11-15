/** Sidebar 的 Project 分组（可折叠） */
import { useState } from "react";
import type { ProjectGroup } from "../../state/sessions";
import { Icon } from "../../ui/Icon";
import { SessionItem } from "./SessionItem";
import styles from "./sidebar.module.css";
import { cx } from "../../lib/cx";

export function ProjectGroupView({
  group,
  activeSessionId,
  filter,
}: {
  group: ProjectGroup;
  activeSessionId?: string;
  filter: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const needle = filter.trim().toLowerCase();
  const sessions = needle
    ? group.sessions.filter((session) => {
        const title = (session.name ?? session.title ?? "").toLowerCase();
        return title.includes(needle);
      })
    : group.sessions;
  if (sessions.length === 0) return null;

  return (
    <section className={styles.group}>
      <button
        type="button"
        className={styles.groupHeader}
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className={styles.groupChevron} data-collapsed={collapsed}>
          <Icon name="chevron-down" size={12} />
        </span>
        <Icon name="folder" size={13} />
        <span className={cx("ellipsis", styles.groupName)} title={group.projectPath}>
          {group.projectName}
        </span>
        <span className={styles.groupCount}>{sessions.length}</span>
      </button>
      {!collapsed && (
        <div className={styles.items}>
          {sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              live={session.id === activeSessionId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

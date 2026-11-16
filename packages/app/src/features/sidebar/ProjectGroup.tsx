/** Sidebar 的 Project 分组（可折叠） */
import { useState } from "react";
import type { ProjectGroup } from "../../state/sessions";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { SessionItem } from "./SessionItem";
import styles from "./sidebar.module.css";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/useLocale";

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
  const { t } = useLocale();
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
      {/* 折叠热区与「+」为兄弟节点：按钮不得嵌套按钮（HTML 合法性 + hydration） */}
      <div className={styles.groupHeader}>
        <button
          type="button"
          className={styles.groupToggle}
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          {/* 文件夹本身表达状态：闭=收起，开口=展开 */}
          <Icon name={collapsed ? "folder" : "folder-open"} size={13} />
          <span className={cx("ellipsis", styles.groupName)} title={group.projectPath}>
            {group.projectName}
          </span>
        </button>
        {/* 视觉件（ADR-0002）：下一阶段接入 pi 后触发 new_session；hover 显现 */}
        <IconButton
          icon="plus"
          title={t("newSessionHint")}
          aria-label={t("newSessionHint")}
          className={styles.groupAdd}
        />
      </div>
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

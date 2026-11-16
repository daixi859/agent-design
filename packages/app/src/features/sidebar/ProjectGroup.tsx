/** Sidebar 的 Project 分组（可折叠）；组级「+」在该项目 cwd 新建会话（GLOSSARY: Drive） */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ProjectGroup } from "../../state/sessions";
import { drive, useDriveSessions } from "../../state/use-drive";
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
  const navigate = useNavigate();
  const driveSessions = useDriveSessions();
  // 新建会话的导航：create 后 attached 帧带回新 sessionId（无 file），出现在驱动表里即导航过去
  const pendingCreate = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(driveSessions.keys());
    if (pendingCreate.current) {
      for (const id of ids) {
        if (!knownIds.current.has(id)) {
          pendingCreate.current = false;
          navigate(`/session/${id}`);
          break;
        }
      }
    }
    knownIds.current = ids;
  }, [driveSessions, navigate]);

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
        {/* 组级新建：在该项目 cwd 触发 new_session（ADR-0012 阶段四接线）；hover 显现 */}
        <IconButton
          icon="plus"
          title={t("createInProject")}
          aria-label={t("createInProject")}
          onClick={() => {
            pendingCreate.current = true;
            drive.create(group.projectPath);
          }}
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

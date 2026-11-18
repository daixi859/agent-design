/** Sidebar 的 Project 分组（可折叠）；组级「+」在该项目 cwd 新建会话（GLOSSARY: Drive） */
import { useState } from "react";
import { useNavigate } from "react-router";
import type { ProjectGroup } from "../../state/sessions";
import { drive } from "../../state/use-drive";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { SessionItem } from "./SessionItem";
import styles from "./sidebar.module.css";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/use-locale";

export function ProjectGroupView({ group, filter }: { group: ProjectGroup; filter: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useLocale();
  const navigate = useNavigate();

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
        <Button
          icon="plus"
          title={t("createInProject")}
          aria-label={t("createInProject")}
          onClick={() => {
            // create 的兑付在 DriveClient 内部：attached/error 帧到达即 resolve/reject
            drive
              .create(group.projectPath)
              .then((sessionId) => navigate(`/session/${sessionId}`))
              .catch(() => {
                // 失败已落连接级错误位（SessionView 顶部错误条渲染），不额外导航
              });
          }}
          className={styles.groupAdd}
        />
      </div>
      {!collapsed && (
        <div className={styles.items}>
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}

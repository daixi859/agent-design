/** Sidebar：左栏本体（Q9 术语；两栏骨架，ADR-0003）。
    Session 列表自订 store（ADR-0015）：App 只传 collapsed，列表数据不再经 props 中转 */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useSessions, useProjectGroups } from "../../state/sessions";
import { cx } from "../../lib/cx";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/Input";
import { useLocale } from "../../state/useLocale";
import { ProjectGroupView } from "./ProjectGroup";
import styles from "./sidebar.module.css";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();
  const { t } = useLocale();
  const sessions = useSessions();
  const groups = useProjectGroups();

  return (
    /* 收起 = 宽度动画到 0（ADR-0009）；inner 固定宽，动画过程中内容不回流 */
    <aside className={cx(styles.sidebar, collapsed && styles.collapsed)}>
      <div className={styles.inner}>
        <div className={styles.header}>
        {/* 原 SearchField 即 Input + search 图标的组合（GLOSSARY「Base Component」） */}
        <Input
          leading={<Icon name="search" size={13} />}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("search")}
        />
        {/* 新建入口在项目组标题行（组级「+」，带 cwd 语义；见 ProjectGroupView） */}
      </div>

        <nav className={`scroll-y ${styles.list}`}>
        {!sessions.rootExists && (
          <p className={styles.empty}>
            <strong>{t("emptyNoPiTitle")}</strong>
            {t("emptyNoPiBefore")} <code>~/.pi/agent/sessions</code> {t("emptyNoPiAfter")}
          </p>
        )}
        {sessions.rootExists && !sessions.loading && groups.length === 0 && (
          <p className={styles.empty}>
            <strong>{t("emptyNothingTitle")}</strong>
            {t("emptyNothingBefore")} <code>pi</code> {t("emptyNothingAfter")}
          </p>
        )}
        {groups.map((group) => (
          <ProjectGroupView key={group.projectPath} group={group} filter={filter} />
        ))}
        </nav>

        <footer className={styles.footer}>
          <span>{sessions.sessions.length} {t("sessionsSuffix")}</span>
          {/* 设置入口（ADR-0009）：右下角固定位置，进独立设置壳 */}
          <Button
            icon="gear"
            title={t("settings")}
            onClick={() => navigate("/settings")}
          />
        </footer>
      </div>
    </aside>
  );
}

/** Settings 壳（ADR-0009）：独立整页双栏——自有导航侧栏（Preview + Appearance/About）
    + 内容区（标题栏：分区标题）。BrandFloat 由 App 常驻于此壳上方。 */
import { NavLink, Outlet, useLocation } from "react-router";
import { cx } from "../../lib/cx";
import { Icon } from "../../ui/Icon";
import styles from "./settings.module.css";

/** 导航条目定义：分组渲染——上部预览路由，分隔线下是偏好与关于 */
const NAV_GROUPS: { label: string; to: string; icon: IconName; end?: boolean }[][] = [
  [{ label: "Preview", to: "preview", icon: "sparkles", end: true }],
  [
    { label: "Appearance", to: "appearance", icon: "sun" },
    { label: "About", to: "about", icon: "doc" },
  ],
];

type IconName = Parameters<typeof Icon>[0]["name"];

const TITLES: Record<string, string> = {
  "/settings/preview": "Preview",
  "/settings/appearance": "Appearance",
  "/settings/about": "About",
};

export function SettingsShell() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Settings";

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Settings">
        {NAV_GROUPS.map((group, index) => (
          <div key={group[0].label} className={styles.group}>
            {index > 0 && <div className={styles.divider} />}
            {group.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(styles.item, isActive && styles.itemActive)
                }
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.content}>
        <header className={styles.contentBar}>
          {/* 返回动线在 Brand Float：hover π 显示回退钮（Q12），此处只承担分区标题 */}
          <span className={styles.contentTitle}>{title}</span>
        </header>
        <div className={styles.contentBody}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

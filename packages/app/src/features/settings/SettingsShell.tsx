/** Settings 壳（ADR-0009）：独立整页双栏——自有导航侧栏（Preview + Appearance/About）
    + 内容区（标题栏：分区标题）。BrandFloat 由 App 常驻于此壳上方，只呈品牌。
    返回主壳的动线固定在导航侧栏底部（ADR-0009 补记一：不动品牌位）。 */
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { cx } from "../../lib/cx";
import type { MessageKey } from "../../lib/i18n";
import { useLocale } from "../../state/use-locale";
import { Icon } from "../../components/Icon";
import nav from "../../components/nav.module.css";
import styles from "./settings.module.css";

/** 导航条目定义：分组渲染——上部预览路由，分隔线下是偏好与关于 */
const NAV_GROUPS: { label: MessageKey; to: string; icon: IconName; end?: boolean }[][] = [
  [
    { label: "preview", to: "preview", icon: "sparkles", end: true },
  ],
  [{ label: "transcript", to: "transcript", icon: "terminal" }],
  [
    { label: "appearance", to: "appearance", icon: "sun" },
    { label: "about", to: "about", icon: "doc" },
  ],
];

type IconName = Parameters<typeof Icon>[0]["name"];

const TITLES: Record<string, MessageKey> = {
  "/settings/preview": "preview",
  "/settings/transcript": "transcript",
  "/settings/appearance": "appearance",
  "/settings/about": "about",
};

export function SettingsShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  const title = TITLES[pathname] ?? "settings";

  return (
    <div className={styles.shell}>
      {/* 侧栏列：导航在上（可滚动），返回动线钉在底部 */}
      <div className={styles.navColumn}>
        <nav className={styles.nav} aria-label={t("settings")}>
          {NAV_GROUPS.map((group, index) => (
            <div key={group[0].label} className={styles.group}>
              {index > 0 && <div className={styles.divider} />}
              {group.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cx(nav.item, isActive && nav.itemActive)}
                >
                  <Icon name={item.icon} size={15} />
                  {t(item.label)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* 返回主壳：nav 条目同款视觉，钉在侧栏底部（侧栏底部是「离开此壳」的动线位） */}
        <div className={styles.navFooter}>
          <button type="button" className={nav.item} onClick={() => navigate("/")}>
            <Icon name="arrow-left" size={15} />
            {t("back")}
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <header className={styles.contentBar}>
          {/* 只承担分区标题：返回动线在侧栏底部（ADR-0009 补记一） */}
          <span className={nav.barTitle}>{t(title)}</span>
        </header>
        <div className={styles.contentBody}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

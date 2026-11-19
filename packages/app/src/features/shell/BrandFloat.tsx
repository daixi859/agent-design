/** Brand Float（ADR-0009）：固定视口左上角的品牌位，与所在表面融为一体，各壳常驻。
    主壳下是双面按钮：静止显示 π，hover 换成侧栏开关图标，点击收起/展开 Sidebar
    （ADR-0009 补记二：动作与品牌同址，但只在主壳）；Settings 与整页阻断态只呈 π。
    Settings 的返回动线独立在设置侧栏底部。 */
import { useLocale } from "../../state/useLocale";
import { Icon } from "../../components/Icon";
import styles from "./brand-float.module.css";

export function BrandFloat({
  mode,
  onToggle,
}: {
  /** 主壳：hover 显示侧栏开关；static：纯品牌位，无动作 */
  mode: "sidebar" | "static";
  /** 仅 sidebar 形态使用 */
  onToggle?: () => void;
}) {
  const { t } = useLocale();

  if (mode === "static") {
    return (
      <div className={styles.float}>
        <span className={styles.mark} aria-hidden="true">
          π
        </span>
      </div>
    );
  }

  return (
    <div className={styles.float}>
      <button type="button" className={styles.home} title={t("toggleSidebar")} onClick={onToggle}>
        <span className={styles.mark} aria-hidden="true">
          π
        </span>
        <span className={styles.actionIcon} aria-hidden="true">
          <Icon name="panel-left" size={17} />
        </span>
      </button>
    </div>
  );
}

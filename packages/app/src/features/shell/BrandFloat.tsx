/** Brand Float（ADR-0009）：固定视口左上角的品牌位，与所在表面融为一体，两种壳下常驻。
    π 与动作图标共用同一按钮（hover 切换）：主壳下动作 = 收起/展开侧栏，
    Settings 壳下动作 = 回主页面（navigate("/")，非 history 回退）。 */
import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { useLocale } from "../../state/useLocale";
import styles from "./brand-float.module.css";

export function BrandFloat({
  mode,
  onToggle,
}: {
  /** 主壳：hover 显示侧栏开关；设置壳：hover 显示回主页钮 */
  mode: "sidebar" | "back";
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useLocale();

  return (
    <div className={styles.float}>
      <button
        type="button"
        className={styles.home}
        title={mode === "sidebar" ? t("toggleSidebar") : t("back")}
        onClick={() => (mode === "sidebar" ? onToggle() : navigate("/"))}
      >
        <span className={styles.mark} aria-hidden="true">
          π
        </span>
        <span className={styles.actionIcon} aria-hidden="true">
          <Icon name={mode === "sidebar" ? "panel-left" : "arrow-left"} size={17} />
        </span>
      </button>
    </div>
  );
}

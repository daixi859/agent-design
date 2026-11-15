/** 设置·外观分区：主题正式入口（分段控件）。与 Session Bar 快捷键共用 useTheme 状态。 */
import { useTheme } from "../../state/useTheme";
import { cx } from "../../lib/cx";
import styles from "./settings.module.css";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function AppearanceSection() {
  const [theme, setTheme] = useTheme();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Theme</h2>
      <div className={styles.segmented} role="group" aria-label="Theme">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx(styles.segment, theme === option.value && styles.segmentActive)}
            aria-pressed={theme === option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        Also switchable from the moon button in the session header.
      </p>
    </section>
  );
}

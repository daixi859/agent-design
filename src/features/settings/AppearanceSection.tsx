/** 设置·外观分区：主题与语言的正式入口（分段控件，ADR-0011）。
    主题与 Session Bar 快捷键共用 useTheme；语言经 useLocale 写 <html lang> 并持久化。 */
import { useTheme } from "../../state/useTheme";
import { useLocale } from "../../state/useLocale";
import { cx } from "../../lib/cx";
import styles from "./settings.module.css";

const THEME_OPTIONS = [
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
] as const;

/** 语言项用各自的本名（endonym），不随界面语言翻译 */
const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
] as const;

export function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const { locale, setLocale, t } = useLocale();

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("theme")}</h2>
        <div className={styles.segmented} role="group" aria-label={t("theme")}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cx(styles.segment, theme === option.value && styles.segmentActive)}
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t("themeHint")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("language")}</h2>
        <div className={styles.segmented} role="group" aria-label={t("language")}>
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cx(styles.segment, locale === option.value && styles.segmentActive)}
              aria-pressed={locale === option.value}
              onClick={() => setLocale(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

/** 设置·外观分区：主题、渲染模式、思考尾部行数与语言的正式入口（分段控件，ADR-0011）。
    主题与 Session Bar 快捷键共用 useTheme；渲染模式共用 useViewMode（ADR-0014）；
    思考尾部行数共用 useTuiThinkLines（ADR-0014：活跃思考行的尾部滚动行数）；
    语言经 useLocale 写 <html lang> 并持久化。 */
import { useTheme } from "../../state/useTheme";
import { useLocale } from "../../state/useLocale";
import { useTuiThinkLines } from "../../state/useTuiThinkLines";
import { useViewMode } from "../../state/useViewMode";
import { TUI_THINK_LINES_OPTIONS } from "../../lib/tui-prefs";
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

/** 渲染模式项（ADR-0014）：值为配置值，标签走 i18n */
const VIEW_MODE_OPTIONS = [
  { value: "standard", label: "viewStandard" },
  { value: "tui", label: "viewTui" },
] as const;

export function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const [viewMode, setViewMode] = useViewMode();
  const [thinkLines, setThinkLines] = useTuiThinkLines();
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
        <h2 className={styles.sectionTitle}>{t("viewMode")}</h2>
        <div className={styles.segmented} role="group" aria-label={t("viewMode")}>
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cx(styles.segment, viewMode === option.value && styles.segmentActive)}
              aria-pressed={viewMode === option.value}
              onClick={() => setViewMode(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t("viewModeHint")}</p>
      </section>

      {viewMode === "tui" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("thinkLines")}</h2>
          <div className={styles.segmented} role="group" aria-label={t("thinkLines")}>
            {TUI_THINK_LINES_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(styles.segment, thinkLines === option && styles.segmentActive)}
                aria-pressed={thinkLines === option}
                onClick={() => setThinkLines(option)}
              >
                {option} {t(option === 1 ? "linesOne" : "linesSuffix")}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{t("thinkLinesHint")}</p>
        </section>
      )}

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

/** dsh-ui 壳：DSH 设计令牌与基础组件的独立预览站。
    两页自 Pi Studio Settings（dsh / dsh-components 分区）迁出，令牌快照与
    组件样张原样搬运；壳只承担页签切换与主题 / 语言切换（存储键独立命名）。 */
import { useState } from "react";
import { useLocale } from "./state/use-locale";
import { useTheme } from "./state/use-theme";
import { Icon } from "./components/Icon";
import { DshPreview } from "./routes/DshPreview";
import { DshComponents } from "./routes/DshComponents";
import styles from "./app.module.css";

type Page = "tokens" | "components";

export default function App() {
  const [page, setPage] = useState<Page>("tokens");
  const { locale, setLocale, t } = useLocale();
  const [theme, setTheme] = useTheme();

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.brand}>DSH UI</span>
        <nav className={styles.tabs}>
          <button
            type="button"
            className={page === "tokens" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            aria-current={page === "tokens" ? "page" : undefined}
            onClick={() => setPage("tokens")}
          >
            {t("tokensTab")}
          </button>
          <button
            type="button"
            className={page === "components" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            aria-current={page === "components" ? "page" : undefined}
            onClick={() => setPage("components")}
          >
            {t("dshComponents")}
          </button>
        </nav>
        <span className={styles.gap} />
        <button
          type="button"
          className={styles.btn}
          title={t("toggleTheme")}
          aria-label={t("toggleTheme")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
        <button
          type="button"
          className={styles.btn}
          title={t("language")}
          aria-label={t("language")}
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
        >
          {locale === "zh" ? "EN" : "中"}
        </button>
      </header>
      <main className={styles.main}>
        {page === "tokens" ? <DshPreview /> : <DshComponents />}
      </main>
    </div>
  );
}

/** Preview（组件清单，ADR-0009 并入设置壳）：本项目的全部 UI 资产验收页——
    图标全网格、控件与徽标、色板、字阶、消息样张。样式直接引用各组件的
    module.css 源头，保证预览即真实组件而非复刻。 */
import { useState } from "react";
import { IconButton } from "../ui/IconButton";
import { SearchField } from "../ui/SearchField";
import { Icon, ICON_NAMES } from "../ui/Icon";
import { cx } from "../lib/cx";
import { useLocale } from "../state/useLocale";
import sessionBar from "../features/sessionbar/session-bar.module.css";
import settings from "../features/settings/settings.module.css";
import styles from "./gallery.module.css";

const SURFACES: Array<[string, string]> = [
  ["canvas", "var(--bg-canvas)"],
  ["sidebar", "var(--bg-sidebar)"],
  ["elevated", "var(--bg-elevated)"],
  ["inset", "var(--bg-inset)"],
  ["accent", "var(--accent)"],
  ["accent-subtle", "var(--accent-subtle)"],
  ["thinking", "var(--thinking)"],
  ["success", "var(--success)"],
  ["warning", "var(--warning)"],
  ["danger", "var(--danger)"],
  ["text-1", "var(--text-1)"],
  ["text-2", "var(--text-2)"],
  ["text-3", "var(--text-3)"],
  ["text-4", "var(--text-4)"],
  ["separator", "var(--separator)"],
];

const TYPE_SAMPLES: Array<[string, string, string]> = [
  ["caption2", "11px", "0123456789 The quick brown fox"],
  ["caption", "12px", "Model switched to deepseek-v4.1-flash"],
  ["footnote", "13px", "Fix the login redirect loop in auth/session.ts"],
  ["body", "14px", "Assistant text reads at document size for long transcripts."],
  ["callout", "15px", "Callout: larger notes stand out when needed."],
  ["title3", "17px", "Session summary heading"],
  ["title2", "20px", "Pi Studio"],
];

export function ComponentGallery() {
  const [search, setSearch] = useState("");
  const { t } = useLocale();

  return (
    <div className={`scroll-y ${styles.gallery}`}>
      <div className={styles.inner}>
        <section>
          <h2 className={styles.sectionTitle}>{t("iconography")}</h2>
          <p className={styles.sectionNote}>{t("iconographyNote")}</p>
          <div className={styles.iconGrid}>
            {ICON_NAMES.map((name) => (
              <figure key={name} className={styles.iconCell}>
                <Icon name={name} size={20} />
                <figcaption className="ellipsis">{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("controlsBadge")}</h2>
          <p className={styles.sectionNote}>{t("controlsNote")}</p>
          <div className={styles.row}>
            <IconButton icon="panel-left" title={t("toggleSidebar")} />
            <IconButton icon="plus" title={t("newSession")} />
            <IconButton icon="gear" title={t("settings")} />
            <IconButton icon="sun" title={t("toggleTheme")} />
            <SearchField value={search} onChange={setSearch} placeholder={t("search")} />
            <span
              className={sessionBar.branchedBadge}
              title={t("branchedTitle")}
            >
              <Icon name="branch" size={11} />
              {t("branched")}
            </span>
          </div>
          <div className={styles.row} role="group" aria-label="Segmented sample">
            <div className={settings.segmented}>
              {[t("light"), t("dark")].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={cx(settings.segment, index === 0 && settings.segmentActive)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("surfaces")}</h2>
          <p className={styles.sectionNote}>{t("surfacesNote")}</p>
          <div className={styles.swatches}>
            {SURFACES.map(([name, variable]) => (
              <figure key={name} className={styles.swatch}>
                <div style={{ background: variable }} />
                <span>{name}</span>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("typeRamp")}</h2>
          <p className={styles.sectionNote}>{t("typeRampNote")}</p>
          <div className={styles.typeRamp}>
            {TYPE_SAMPLES.map(([token, size, text]) => (
              <div key={token}>
                <span style={{ fontSize: size }}>{text}</span>
                <em>
                  --text-{token} · {size}
                </em>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
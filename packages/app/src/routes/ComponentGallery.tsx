/** Preview（组件清单，ADR-0009 并入设置壳）：本项目的全部 UI 资产验收页——
    基础组件展厅（图标全网格、Button 三形态、Input、DisclosureRow）、色板、字阶。
    样式直接引用各组件的 module.css 源头，保证预览即真实组件而非复刻。 */
import { useState } from "react";
import { Button } from "../components/Button";
import { DisclosureRow } from "../components/DisclosureRow";
import { Icon, ICON_NAMES } from "../components/Icon";
import { Input } from "../components/Input";
import { Tag } from "../components/Tag";
import { cx } from "../lib/cx";
import { useLocale } from "../state/use-locale";
import settings from "../features/settings/settings.module.css";
import styles from "./gallery.module.css";

const SURFACES: Array<[string, string]> = [
  ["canvas", "var(--bg-canvas)"],
  ["elevated", "var(--bg-elevated)"],
  ["inset", "var(--bg-inset)"],
  ["sidebar(=inset)", "var(--bg-sidebar)"],
  ["code-bg", "var(--code-bg)"],
  ["bubble-user", "var(--bubble-user-bg)"],
  ["accent", "var(--accent)"],
  ["accent-subtle", "var(--accent-subtle)"],
  ["success", "var(--success)"],
  ["warning", "var(--warning)"],
  ["danger", "var(--danger)"],
  ["text-1", "var(--text-1)"],
  ["text-2", "var(--text-2)"],
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
  const [disclosureOpen, setDisclosureOpen] = useState(true);
  const { t } = useLocale();

  return (
    <div className={`scroll-y ${styles.gallery}`}>
      <div className={styles.inner}>
        <section>
          <h2 className={cx("eyebrow", styles.sectionTitle)}>{t("iconography")}</h2>
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
          <h2 className={cx("eyebrow", styles.sectionTitle)}>{t("controlsBadge")}</h2>
          <p className={styles.sectionNote}>{t("controlsNote")}</p>
          <div className={styles.row}>
            {/* Button icon-only 形态：icon 槽位 + 无 children 自动方形（原 IconButton） */}
            <Button icon="panel-left" title={t("toggleSidebar")} />
            <Button icon="plus" title={t("newSession")} />
            <Button icon="gear" title={t("settings")} />
            <Button icon="sun" title={t("toggleTheme")} />
            {/* 图标+文字 / 纯文字形态：同一 ghost 配方 */}
            <Button icon="plus">{t("newSession")}</Button>
            <Button>{t("buttonSample")}</Button>
            <Input
              leading={<Icon name="search" size={13} />}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search")}
            />
            {/* Tag 胶囊变体（accent 徽标 = Session Bar branched 同款）与弱化小徽标 */}
            <Tag pill tone="accent" title={t("branchedTitle")}>
              <Icon name="branch" size={11} />
              {t("branched")}
            </Tag>
            <Tag title={t("modelImageInput")}>{t("visualTag")}</Tag>
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

        {/* 基础件样张：DisclosureRow 只管行头交互（role=button · Enter/Space · aria-expanded），
            行头视觉由本页样张提供；chevron 旋转沿用 TuiGroup 的 data-open 惯用法 */}
        <section>
          <h2 className={cx("eyebrow", styles.sectionTitle)}>{t("disclosureRow")}</h2>
          <p className={styles.sectionNote}>{t("disclosureRowNote")}</p>
          <div className={styles.disclosureDemo}>
            <DisclosureRow
              className={styles.disclosureHeader}
              open={disclosureOpen}
              onClick={() => setDisclosureOpen((open) => !open)}
            >
              <span className={styles.disclosureChevron} data-open={disclosureOpen || undefined}>
                <Icon name="chevron-right" size={12} />
              </span>
              <span className={styles.disclosureTitle}>{t("disclosureSampleTitle")}</span>
            </DisclosureRow>
            {disclosureOpen && (
              <p className={styles.disclosureBody}>{t("disclosureSampleBody")}</p>
            )}
          </div>
        </section>

        <section>
          <h2 className={cx("eyebrow", styles.sectionTitle)}>{t("surfaces")}</h2>
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
          <h2 className={cx("eyebrow", styles.sectionTitle)}>{t("typeRamp")}</h2>
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

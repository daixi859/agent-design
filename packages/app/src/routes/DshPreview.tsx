/** DSH 预览（Settings · 新分区）：deepseek-harness 的 --dsw-* 设计令牌摘录陈列页。
    令牌快照见 styles/tokens.dsh.css（--dsh-* 命名空间，主题作用域统一挂
    [data-theme='dark']）；本页样式一律引用该快照，与本项目语义层互不混用。
    基础组件清单见 ui-primitives README，此处陈列其用料：色板 / 字阶 / 圆角 /
    阴影与 elevation / 菜单材质。 */
import "../styles/tokens.dsh.css";
import { useLocale } from "../state/use-locale";
import styles from "./dsh-preview.module.css";

/** 静态色板：家族 → 刻度（快照全量，两主题共 82 项；预览按家族分组陈列） */
const STATIC_FAMILIES: Array<[string, string[]]> = [
  ["deepseek", ["50", "100", "200", "300", "400", "450", "500", "600", "700-delete", "800", "900"]],
  ["blue", ["50", "50p", "75", "100", "300", "400", "450", "500", "600", "800", "900", "950"]],
  ["green", ["100", "400", "500", "900"]],
  ["amber", ["100", "400", "500", "600", "900"]],
  ["red", ["50", "100", "400", "500", "600", "900"]],
  ["violet", ["400", "600"]],
  ["neutral", ["00", "50", "100", "150", "200", "250", "300", "400", "500", "550", "600", "700", "800", "850", "900", "1000"]],
  ["neutral-bluish", ["00", "50", "55", "60", "75", "90", "100", "150", "200", "300", "310", "400", "500", "600", "700", "750", "800", "850", "875", "900", "950", "1000"]],
];

/** 语义别名：预览页挑陈列的代表档（全量定义在 tokens.dsh.css） */
const ALIASES: Array<[string, string]> = [
  ["bg-base", "--dsh-alias-bg-base"],
  ["bg-layer-1", "--dsh-alias-bg-layer-1"],
  ["bg-layer-2", "--dsh-alias-bg-layer-2"],
  ["bg-layer-3", "--dsh-alias-bg-layer-3"],
  ["bg-module-platform", "--dsh-alias-bg-module-platform"],
  ["bg-overlay", "--dsh-alias-bg-overlay"],
  ["card-fill", "--dsh-alias-card-fill"],
  ["card-fill-hover", "--dsh-alias-card-fill-hover"],
  ["border-l1", "--dsh-alias-border-l1"],
  ["border-l2", "--dsh-alias-border-l2"],
  ["border-l3", "--dsh-alias-border-l3"],
  ["border-l4", "--dsh-alias-border-l4"],
  ["label-primary", "--dsh-alias-label-primary"],
  ["label-secondary", "--dsh-alias-label-secondary"],
  ["label-tertiary", "--dsh-alias-label-tertiary"],
  ["label-caption", "--dsh-alias-label-caption"],
  ["link", "--dsh-alias-link"],
  ["brand-primary", "--dsh-alias-brand-primary"],
  ["button-info-fill", "--dsh-alias-button-info-fill"],
  ["markdown-code-block", "--dsh-alias-markdown-code-block"],
  ["tooltip-bg", "--dsh-alias-tooltip-bg"],
  ["toast-bg", "--dsh-alias-toast-bg"],
  ["menu-surface-fill", "--dsh-menu-surface-fill"],
  ["success", "--dsh-alias-state-success-primary"],
  ["warn", "--dsh-alias-state-warn-primary"],
  ["error", "--dsh-alias-state-error-primary"],
  ["done", "--dsh-alias-state-done-primary"],
  ["idle", "--dsh-alias-state-idle-primary"],
];

/** 字阶：DSH UI 刻度代表档 + markdown 档（快照只留主档，strong/italic 变体略） */
const TYPE_SAMPLES: Array<[string, string]> = [
  ["xl-24", "--dsh-font-xl-24"],
  ["l-20", "--dsh-font-l-20"],
  ["m-18", "--dsh-font-m-18"],
  ["base-16", "--dsh-font-base-16"],
  ["s-14", "--dsh-font-s-14"],
  ["xs-13", "--dsh-font-xs-13"],
  ["xxs-12", "--dsh-font-xxs-12"],
  ["xxxs-11", "--dsh-font-xxxs-11"],
  ["markdown-h1", "--dsh-font-markdown-h1"],
  ["markdown-h2", "--dsh-font-markdown-h2"],
  ["markdown-h3", "--dsh-font-markdown-h3"],
  ["markdown-base", "--dsh-font-markdown-base"],
  ["markdown-small", "--dsh-font-markdown-small"],
  ["markdown-code", "--dsh-font-markdown-code"],
];

/** 圆角刻度（base.css） */
const RADII: Array<[string, string]> = [
  ["xs 4px", "--dsh-radius-xs"],
  ["sm 8px", "--dsh-radius-sm"],
  ["md 12px", "--dsh-radius-md"],
  ["lg 16px", "--dsh-radius-lg"],
  ["xl 20px", "--dsh-radius-xl"],
  ["panel 28px", "--dsh-radius-panel"],
];

/** 阴影与 elevation（gradient-shadow-text.css） */
const SHADOWS: Array<[string, string]> = [
  ["shadow-lv1", "--dsh-shadow-lv1"],
  ["shadow-lv2", "--dsh-shadow-lv2"],
  ["shadow-lv3", "--dsh-shadow-lv3"],
  ["elevation-panel", "--dsh-elevation-panel"],
  ["elevation-prominent", "--dsh-elevation-prominent"],
  ["elevation-soft", "--dsh-elevation-soft"],
];

export function DshPreview() {
  const { t } = useLocale();
  return (
    <div className={`scroll-y ${styles.preview}`}>
      <div className={styles.inner}>
        {/* ---- 静态色板 ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshStaticPalette")}</h2>
          <p className={styles.sectionNote}>{t("dshStaticNote")}</p>
          {STATIC_FAMILIES.map(([family, steps]) => (
            <div key={family} className={styles.family}>
              <h3 className={styles.familyName}>{family}</h3>
              <div className={styles.swatches}>
                {steps.map((step) => (
                  <figure key={step} className={styles.swatch}>
                    <div
                      className={styles.swatchColor}
                      style={{ background: `var(--dsh-static-${family}-${step})` }}
                    />
                    <figcaption>{step}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ---- 语义别名 ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshAlias")}</h2>
          <p className={styles.sectionNote}>{t("dshAliasNote")}</p>
          <div className={styles.swatches}>
            {ALIASES.map(([name, variable]) => (
              <figure key={name} className={styles.swatch}>
                <div className={styles.swatchColor} style={{ background: `var(${variable})` }} />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ---- 字阶 ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshTypeRamp")}</h2>
          <p className={styles.sectionNote}>{t("dshTypeNote")}</p>
          <div className={styles.typeRamp}>
            {TYPE_SAMPLES.map(([name, variable]) => (
              <div key={name} className={styles.typeRow}>
                <span className={styles.typeSample} style={{ font: `var(${variable})` }}>
                  Design tokens 42
                </span>
                <em>{name}</em>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 圆角 ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshRadius")}</h2>
          <p className={styles.sectionNote}>{t("dshRadiusNote")}</p>
          <div className={styles.radiusRow}>
            {RADII.map(([name, variable]) => (
              <div key={name} className={styles.radiusCell}>
                <div
                  className={styles.radiusBox}
                  style={{ borderRadius: `var(${variable})` }}
                />
                <em>{name}</em>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 阴影与 elevation ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshElevation")}</h2>
          <p className={styles.sectionNote}>{t("dshElevationNote")}</p>
          <div className={styles.shadowRow}>
            {SHADOWS.map(([name, variable]) => (
              <div key={name} className={styles.shadowCell}>
                <div
                  className={styles.shadowBox}
                  style={{ boxShadow: `var(${variable})` }}
                />
                <em>{name}</em>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 菜单材质 ---- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshMenuMaterial")}</h2>
          <p className={styles.sectionNote}>{t("dshMenuNote")}</p>
          <div className={styles.menuDemo}>
            <div className={styles.menuPanel}>
              <div className={styles.menuItem}>{t("dshMenuSampleItem1")}</div>
              <div className={styles.menuItem}>{t("dshMenuSampleItem2")}</div>
              <div className={styles.menuItem}>{t("dshMenuSampleItem3")}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

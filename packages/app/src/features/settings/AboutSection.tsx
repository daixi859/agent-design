/** 设置·关于分区：项目定位、只读 API 约束（ADR-0002）与版本信息。 */
import packageJson from "../../../package.json";
import { useLocale } from "../../state/useLocale";
import styles from "./settings.module.css";

export function AboutSection() {
  const { t } = useLocale();
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("about")}</h2>
      <p className={styles.aboutLine}>{t("aboutIntro")}</p>
      <dl className={styles.aboutList}>
        <dt>{t("version")}</dt>
        <dd>{packageJson.version}</dd>
        <dt>{t("stack")}</dt>
        <dd>{t("stackValue")}</dd>
        <dt>{t("data")}</dt>
        <dd>{t("dataValue")}</dd>
      </dl>
    </section>
  );
}

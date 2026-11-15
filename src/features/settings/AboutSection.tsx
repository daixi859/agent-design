/** 设置·关于分区：项目定位、只读 API 约束（ADR-0002）与版本信息。 */
import packageJson from "../../../package.json";
import styles from "./settings.module.css";

export function AboutSection() {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>About</h2>
      <p className={styles.aboutLine}>
        Pi Studio is a read-only viewer for pi kernel session data on this machine —
        built for high-fidelity design review. Sessions, transcripts and tool activity
        are rendered exactly as recorded; the input area is a visual placeholder, and
        the API stays read-only.
      </p>
      <dl className={styles.aboutList}>
        <dt>Version</dt>
        <dd>{packageJson.version}</dd>
        <dt>Stack</dt>
        <dd>React + Vite · CSS Modules</dd>
        <dt>Data</dt>
        <dd>Local session JSONL, read-only</dd>
      </dl>
    </section>
  );
}

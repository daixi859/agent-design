/** Thinking 块：签名元素（Q12 点睛）——紫色发丝线 + 淡紫底，默认折叠 */
import { Icon } from "../../components/Icon";
import { useLocale } from "../../state/useLocale";
import styles from "./transcript.module.css";

export function ThinkingSection({ thinking, redacted }: { thinking: string; redacted?: boolean }) {
  const { t } = useLocale();
  return (
    <details className={styles.thinking}>
      <summary className={styles.thinkingSummary}>
        <Icon name="sparkles" size={13} />
        {redacted ? t("encryptedReasoning") : t("thinking")}
        <span className={styles.thinkingChevron}>
          <Icon name="chevron-right" size={12} />
        </span>
      </summary>
      <div className={styles.thinkingBody}>{thinking}</div>
    </details>
  );
}

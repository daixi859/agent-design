/** Session 视图：加载/错误态 + Transcript（detail 经 outlet context 由 MainShell 下发） */
import { useOutletContext } from "react-router";
import { useLocale } from "../../state/useLocale";
import type { SessionDetailState } from "../../state/useSessionDetail";
import { Icon } from "../../ui/Icon";
import { Transcript } from "../transcript/Transcript";
import styles from "../transcript/transcript.module.css";

export function SessionView() {
  const { t } = useLocale();
  const data = useOutletContext<SessionDetailState>();

  if (data.error) {
    return (
      <div className={styles.emptyState}>
        <Icon name="warning" size={28} />
        <strong>{t("loadFailedTitle")}</strong>
        <span>{data.error}</span>
      </div>
    );
  }

  if (data.loading && !data.header) {
    return (
      <div className={styles.emptyState}>
        <Icon name="sparkles" size={28} />
        <span>{t("loadingSession")}</span>
      </div>
    );
  }

  return (
    <Transcript projectPath={data.header?.cwd} view={data.view} />
  );
}

/** Session 视图：加载/错误态 + Transcript（detail 经 outlet context 由 MainShell 下发）。
    被驱动时把驱动状态与动作接进 Transcript（输入区激活）。 */
import { useOutletContext, useParams } from "react-router";
import { useLocale } from "../../state/useLocale";
import { drive } from "../../state/use-drive";
import type { SessionDetailState } from "../../state/useSessionDetail";
import { Icon } from "../../ui/Icon";
import { Transcript } from "../transcript/Transcript";
import styles from "../transcript/transcript.module.css";

export function SessionView() {
  const { t } = useLocale();
  const { id } = useParams<{ id: string }>();
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

  const composerDrive =
    data.drive && id
      ? {
          status: data.drive.status,
          onSend: (text: string) => drive.sendText(id, text),
          onAbort: () => drive.abort(id),
        }
      : undefined;

  return <Transcript projectPath={data.header?.cwd} view={data.view} drive={composerDrive} />;
}

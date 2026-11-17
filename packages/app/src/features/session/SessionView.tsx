/** Session 视图：加载/错误态 + Transcript（detail 经 outlet context 由 MainShell 下发）。
    被驱动时把驱动状态与动作接进 Transcript（输入区激活）。
    错误出口：详情加载失败、驱动会话错误（lastError）与连接级错误都渲染为顶部错误条。 */
import { useOutletContext, useParams } from "react-router";
import { useLocale } from "../../state/useLocale";
import { drive, useConnectionError, useDriveSession } from "../../state/use-drive";
import { queuedCountOf } from "../../lib/drive-client";
import { driveErrorText } from "../../lib/drive-errors";
import type { SessionDetailState } from "../../state/useSessionDetail";
import { Icon } from "../../ui/Icon";
import { Transcript } from "../transcript/Transcript";
import styles from "../transcript/transcript.module.css";

export function SessionView() {
  const { t } = useLocale();
  const { id } = useParams<{ id: string }>();
  const data = useOutletContext<SessionDetailState>();
  const driveSession = useDriveSession(id);
  const connectionError = useConnectionError();
  // 连接级错误优先（它解释为什么 attach/create 不生效）；带 code 的走 i18n
  const errorText = connectionError
    ? driveErrorText(connectionError.code, connectionError.message, t)
    : driveSession?.lastError;

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
          onFollowUp: (text: string) => drive.followUp(id, text),
          onAbort: () => drive.abort(id),
          callingTool: data.drive.streamingToolCalls?.at(-1)?.name,
          queuedCount: queuedCountOf(data.drive),
          compacting: data.drive.compacting,
        }
      : undefined;

  return (
    <>
      {errorText && (
        <div className={styles.errorBar} role="alert">
          <Icon name="warning" size={13} />
          <span>{errorText}</span>
        </div>
      )}
      <Transcript
        projectPath={data.header?.cwd}
        view={data.view}
        drive={composerDrive}
        live={data.drive?.status === "running" || data.drive?.status === "retrying"}
      />
    </>
  );
}

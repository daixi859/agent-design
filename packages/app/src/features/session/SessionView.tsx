/** Session 视图：加载/错误态 + Transcript（detail 经 outlet context 由 MainShell 下发）。
    被驱动时把驱动状态与动作接进 Transcript；未驱动但可接管的会话下发懒接管插槽
    （GLOSSARY Send-to-Attach：输入区常开，首条发送即 attach+prompt，ADR-0012 补记十一）。
    他属驱动由 REST driven 标志 × 本端驱动表判定（标志是快照，竞态由 attach 拒绝的错误条兜底）。
    错误出口：详情加载失败、驱动会话错误（lastError）与连接级错误都渲染为顶部错误条。 */
import { useOutletContext, useParams } from "react-router";
import { useLocale } from "../../state/use-locale";
import { useSessionSummary } from "../../state/sessions";
import {
  drive,
  useCachedCatalog,
  useConnectionError,
  useDriveSession,
  type QueuedItem,
} from "../../state/use-drive";
import { mergeBrowsingCatalog } from "../../lib/drive-client";
import { useGlobalCatalog } from "../../state/global-catalog";
import { driveErrorText } from "../../lib/drive-errors";
import type { SessionDetailState } from "../../state/use-session-detail";
import { Icon } from "../../components/Icon";
import { Transcript } from "../transcript/Transcript";
import styles from "../transcript/transcript.module.css";

export function SessionView() {
  const { t } = useLocale();
  const { id } = useParams<{ id: string }>();
  const data = useOutletContext<SessionDetailState>();
  const driveSession = useDriveSession(id);
  const summary = useSessionSummary(id);
  const connectionError = useConnectionError();
  // 浏览态 Model Seat 与 Trigger Menu 的目录（补记十二/十四/十五）：切片级合并——
  // model / commands 各自会话缓存优先（档位带会话 clamp、命令属会话项目）、全局目录
  // 兜底（GET /api/catalog）。整目录级 `??` 会漏切片（缓存命中时全局 commands 被
  // 挡掉），合并走 mergeBrowsingCatalog。驱动态不消费（catalog 随 attached 新鲜到达）。
  // hook 纪律（补记十二）：两粒 hook 无条件调用——`??` 会短路，链在表达式里会在缓存
  // 命中时少调 hook（渲染间 hook 数漂移）
  const cachedCatalog = useCachedCatalog(id);
  const globalCatalog = useGlobalCatalog();
  const browsingCatalog = mergeBrowsingCatalog(cachedCatalog, globalCatalog);
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

  // 接管依据的 file：详情一次取数直带（不依赖 5s 轮询命中），轮询摘要兜底；
  // 他属驱动：REST 标志为真且本端驱动表没有该会话（乐观注册在场即视为本端在管）
  const file = data.file ?? summary?.file;
  const foreignDriven = Boolean(summary?.driven) && !driveSession;
  const composerDrive =
    data.drive && id
      ? {
          status: data.drive.status,
          onSend: (text: string) => drive.sendText(id, text),
          onSteer: (text: string) => drive.steerText(id, text),
          onRebuildQueue: (items: QueuedItem[]) => drive.rebuildQueue(id, items),
          onAbort: () => drive.abort(id),
          onSetModel: (provider: string, modelId: string) => drive.setModel(id, provider, modelId),
          onSetThinkingLevel: (level: string) => drive.setThinkingLevel(id, level),
          onCompact: () => drive.compact(id),
          queued: data.drive.queued,
          pendingQueue: data.drive.pendingQueue,
          catalog: data.drive.catalog,
          usage: data.drive.usage,
          compacting: data.drive.compacting,
          retryAttempt: data.drive.retryAttempt,
        }
      : undefined;
  const lazyComposer =
    id && file && !driveSession
      ? {
          foreignDriven,
          onSend: (text: string) => drive.sendText(id, text, file),
          // 浏览态选择（补记十二）：挂起待发送兑付；他属驱动时 Composer 侧恒禁不达
          onSetModel: (provider: string, modelId: string) => drive.setPendingChoice(id, { provider, modelId }),
          onSetThinkingLevel: (level: string) => drive.setPendingChoice(id, { thinkingLevel: level }),
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
        lazy={lazyComposer}
        browsingCatalog={browsingCatalog}
        sessionId={id}
      />
    </>
  );
}

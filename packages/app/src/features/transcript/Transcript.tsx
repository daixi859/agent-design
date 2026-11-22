/** Transcript：对话区本体（ADR-0006 三级结构，ADR-0013 收敛为两级：Turn / Process Group；数据直收 TranscriptModel） */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { emptyGroupRecap, type TranscriptModel, type TurnItem } from "../../lib/transcript-model";
import { tuiDetachOf } from "../../lib/tui-view";
import type { SessionCatalog } from "@pi-studio/shared/protocol";
import type { ComposerActions, LazyComposer } from "./Composer";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { cx } from "../../lib/cx";
import { AnnotationRow } from "./AnnotationRow";
import { Composer } from "./Composer";
import { TuiGroup } from "./TuiGroup";
import { TurnView } from "./TurnView";
import { useLocale } from "../../state/use-locale";
import { useViewMode } from "../../state/use-view-mode";
import { useStickToBottom } from "../../state/use-stick-to-bottom";
import { useDriveLive } from "../../state/use-drive";
import styles from "./transcript.module.css";

export function Transcript({
  projectPath,
  view,
  actions,
  lazy,
  browsingCatalog,
  sessionId,
  foreignDriven,
  takeover,
}: {
  projectPath?: string;
  view: TranscriptModel;
  /** 本端在管的动作插槽（C3 修订：状态数据由 Composer 直订 store，props 只传动作） */
  actions?: ComposerActions;
  /** 未驱动但可接管时下发（GLOSSARY Send-to-Attach）：输入区常开 */
  lazy?: LazyComposer;
  /** 浏览态 Model Seat 的缓存目录（补记十二）：驱动态不消费，未驱动时供可选菜单 */
  browsingCatalog?: SessionCatalog;
  /** 路由 session id：运行态由本组件 selector 直订（ADR-0015），不再经 props 下传；
      下游 TurnView / TuiGroup 收到的是本处派生的布尔（数据走 props、状态走订阅） */
  sessionId?: string;
  /** 他属驱动（REST driven 标志 × 本端驱动表）：ComposerMode 的 foreign 判据 */
  foreignDriven?: boolean;
  /** 可懒接管：file 在场：ComposerMode 的 takeover 判据 */
  takeover?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const { t } = useLocale();
  // 运行态（GLOSSARY live = running / retrying）：selector 出原始布尔，
  // 流式 delta 不改 DriveStatus，订阅本身不触发重渲（重渲来自 view 数据推进）
  const live = useDriveLive(sessionId);

  // 滚动区贴底跟随（useStickToBottom，阈值放宽到 80px）：跟随解除与 jump 按钮显隐同源判定
  const { nearBottomRef, stick: stickBottom, onScroll: onScrollBase } =
    useStickToBottom(scrollRef, 80);

  const handleScroll = useCallback(() => {
    onScrollBase();
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(!nearBottomRef.current && el.scrollHeight > el.clientHeight + 120);
  }, [onScrollBase, nearBottomRef]);

  // Live Tail 追新时自动跟随（Q17：仅在用户贴底时）
  useEffect(() => {
    stickBottom();
  }, [view, stickBottom]);

  // 单一列宽轴（ADR-0013）：把容器实际宽度发布成 --pane-width，
  // 内容列宽由 clamp(680px, pane × 0.64, 920px) 派生；未发布时退回 760px 等效值。
  const [paneWidth, setPaneWidth] = useState<number>();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width) setPaneWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { turns, orphanAnnotations } = view;
  // 末轮即当前生成中的那一轮：只有它值得默认展开（历史轮展开会撑开整篇对话）
  const lastTurnId = turns.at(-1)?.id;

  // TUI 模式（ADR-0014 迭代）：运行中的组贴底——从对话流抽出到滚动区末尾渲染，
  // 配合贴底自动跟随，运行状态始终在视口底部，与 DSH 的组顶 Recap 拉开形态。
  // 抽取判定（末轮且 live/draft、目标组、首 token 前空窗锚）在 lib/tui-view 纯函数层
  // （C4 收编），这里只决定是否消费
  const [viewMode] = useViewMode();
  const lastTurn = turns.at(-1);
  const detach = tuiDetachOf(lastTurn, live, viewMode === "tui");
  const detachGroupId = detach.groupId;
  const detached: TurnItem | undefined =
    detachGroupId && lastTurn ? lastTurn.items.find((item) => item.id === detachGroupId) : undefined;
  // 首 token 前的空窗（迭代反馈）：turn 已存在（user 已回显）但还没有任何组——
  // 贴底挂一个空组形态的运行指示，计时锚在 user 条目时刻
  const livePendingAnchor = detach.pendingAnchorAt;

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  return (
    <div
      className={styles.wrap}
      style={paneWidth ? ({ "--pane-width": `${paneWidth}px` } as CSSProperties) : undefined}
    >
      {/* 底部 Composer 与滚动区共用一个列宽轴 */}
      <div className={`scroll-y ${styles.scroll}`} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.inner}>
          {projectPath && <p className={cx("eyebrow", styles.projectEyebrow)}>{projectPath}</p>}
          {orphanAnnotations.map((carrier) => (
            <AnnotationRow key={carrier.id} display={carrier.display} />
          ))}
          {turns.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title={t("emptyBranchTitle")}
              hint={t("emptyBranchHint")}
            />
          ) : (
            turns.map((turn) => (
              // 驱动中且是末轮才视为「生成中」：REST/Live Tail 浏览路径不改变既有折叠行为
              <TurnView
                key={turn.id}
                turn={turn}
                live={live && turn.id === lastTurnId}
                detachGroupId={turn.id === lastTurnId ? detachGroupId : undefined}
              />
            ))
          )}
          {detached && detached.kind === "group" && (
            <TuiGroup
              group={detached.group}
              recap={detached.recap}
              drafting={Boolean(lastTurn?.draft)}
              live={live}
            />
          )}
          {livePendingAnchor !== undefined && (
            <TuiGroup group={[]} recap={emptyGroupRecap()} live={live} startedAt={livePendingAnchor} />
          )}
        </div>
      </div>

      {showJump && (
        <button type="button" className={styles.jumpLatest} onClick={jumpToLatest}>
          <Icon name="arrow-down" size={13} />
          {t("jumpLatest")}
        </button>
      )}

      <Composer
        model={view.model}
        thinkingLevel={view.thinkingLevel}
        actions={actions}
        lazy={lazy}
        browsingCatalog={browsingCatalog}
        sessionId={sessionId}
        foreignDriven={foreignDriven}
        takeover={takeover}
      />
    </div>
  );
}
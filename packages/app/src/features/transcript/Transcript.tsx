/** Transcript：对话区本体（ADR-0006 三级结构，ADR-0013 收敛为两级：Turn / Process Group；数据直收 TranscriptModel） */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { TranscriptModel, TurnItem } from "../../lib/transcript-model";
import type { ComposerDrive } from "./Composer";
import { Icon } from "../../components/Icon";
import { AnnotationRow } from "./AnnotationRow";
import { Composer } from "./Composer";
import { TuiGroup } from "./TuiGroup";
import { TurnView } from "./TurnView";
import { useLocale } from "../../state/useLocale";
import { useViewMode } from "../../state/useViewMode";
import { useStickToBottom } from "../../state/useStickToBottom";
import { useDriveLive } from "../../state/use-drive";
import styles from "./transcript.module.css";

export function Transcript({
  projectPath,
  view,
  drive,
  sessionId,
}: {
  projectPath?: string;
  view: TranscriptModel;
  /** 会话被驱动时由 SessionView 下发：输入区激活、状态徽标与中止 */
  drive?: ComposerDrive;
  /** 路由 session id：运行态由本组件 selector 直订（ADR-0015），不再经 props 下传；
      下游 TurnView / TuiGroup 收到的是本处派生的布尔（数据走 props、状态走订阅） */
  sessionId?: string;
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
  // 抽取条件 = 末轮且（驱动运行中或流式草稿）；历史残留 running 组不动（不发明「已死」态）。
  // 目标组与空窗锚是模型层派生量（Turn.tailGroupId / userAt），这里只决定是否消费
  const [viewMode] = useViewMode();
  const lastTurn = turns.at(-1);
  const detachGroupId =
    viewMode === "tui" && lastTurn && (live || lastTurn.draft) ? lastTurn.tailGroupId : undefined;
  const detached: TurnItem | undefined =
    detachGroupId && lastTurn ? lastTurn.items.find((item) => item.id === detachGroupId) : undefined;
  // 首 token 前的空窗（迭代反馈）：turn 已存在（user 已回显）但还没有任何组——
  // 贴底挂一个空组形态的运行指示，计时锚在 user 条目时刻
  const livePendingAnchor =
    viewMode === "tui" && lastTurn && (live || lastTurn.draft) && !lastTurn.tailGroupId
      ? lastTurn.userAt
      : undefined;

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
          {projectPath && <p className={styles.projectEyebrow}>{projectPath}</p>}
          {orphanAnnotations.map((entry) => (
            <AnnotationRow key={entry.id} entry={entry} />
          ))}
          {turns.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="sparkles" size={28} />
              <strong>{t("emptyBranchTitle")}</strong>
              <span>{t("emptyBranchHint")}</span>
            </div>
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
            <TuiGroup
              group={[]}
              recap={{ tools: 0, thoughts: 0, failed: 0, running: false, toolCounts: [] }}
              live={live}
              startedAt={livePendingAnchor}
            />
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
        drive={drive}
        sessionId={sessionId}
      />
    </div>
  );
}

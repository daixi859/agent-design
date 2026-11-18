/** Composer：会话输入区（ADR-0017 重设计）。未驱动时保持视觉态（attach 解锁）。
    动作与状态各归其位：底栏左 = Model Seat + Context Ring，右 = Stop（busy 时）
    与发送；运行态占位符化（排队 / 重试 / 压缩），中断 = Stop 钮或双击 Esc（500ms），
    中断保留队列。发送语义：idle → prompt（兜底 followUp），busy → followUp 排队，
    Ctrl/Cmd+Enter 显式插话。`/` 行首触发 Trigger Menu，命令落定为 Command Chip。 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ContextUsageInfo, DriveStatus, SessionCatalog } from "@pi-studio/shared/protocol";
import { Icon, type IconName } from "../../components/Icon";
import { MenuSurface, MenuSurfaceItem, hasOpenMenuSurface } from "../../components/MenuSurface";
import { Tooltip } from "../../components/Tooltip";
import { clearDraft, loadDraft, saveDraft, type PersistedChip } from "../../lib/draft-store";
import { isBusyStatus } from "../../lib/drive-client";
import { translateVars } from "../../lib/i18n";
import { detectSlashTrigger, filterCommands, type MenuCommand } from "../../lib/trigger-menu";
import { useLocale } from "../../state/useLocale";
import type { QueuedItem } from "../../state/use-drive";
import { ContextRing } from "./ContextRing";
import { ModelSeat } from "./ModelSeat";
import { QueueDock, type QueueRow } from "./QueueDock";
import styles from "./transcript.module.css";
import menuStyles from "../../components/menu-surface.module.css";

/** 命令图标按来源映射（内建另计） */
const COMMAND_ICON: Record<NonNullable<MenuCommand["source"]>, IconName> = {
  extension: "terminal",
  prompt: "doc",
  skill: "sparkles",
};

export interface ComposerDrive {
  status: DriveStatus;
  /** 语义发送：idle → prompt；busy → followUp 排队（Queue Dock） */
  onSend(text: string): void;
  /** 显式插话（GLOSSARY「Steer」）：Ctrl/Cmd+Enter 走这 */
  onSteer(text: string): void;
  /** Queue Dock 行内操作落点（整批重编，ADR-0016） */
  onRebuildQueue(items: QueuedItem[]): void;
  onAbort(): void;
  /** 手动压缩（Trigger Menu 内建 compact） */
  onCompact(): void;
  onSetModel(provider: string, modelId: string): void;
  onSetThinkingLevel(level: string): void;
  /** 内核排队快照 + 本地待确认发送：Queue Dock 数据源 */
  queued?: { steering: string[]; followUp: string[] };
  pendingQueue?: readonly string[];
  /** 目录与用量（ADR-0016）：Model Seat / Context Ring 数据源 */
  catalog?: SessionCatalog;
  usage?: ContextUsageInfo;
  /** 内核正在压缩上下文：期间新 prompt 被内核拒绝 */
  compacting?: boolean;
  /** 仅 retrying：第几次自动重试（占位符文案） */
  retryAttempt?: number;
}

const COMMAND_MENU_ID = "composer-trigger-menu";

export function Composer({
  model,
  thinkingLevel,
  variant = "overlay",
  drive,
  sessionId,
}: {
  /** 当前模型声明（entries 派生优先；create 出的会话回落 catalog.current） */
  model?: { provider?: string; modelId?: string };
  thinkingLevel?: string;
  /** overlay：钉在 Transcript 底部；docked：文档流内（组件总览用） */
  variant?: "overlay" | "docked";
  /** 存在即激活：会话已被驱动（GLOSSARY: Attach） */
  drive?: ComposerDrive;
  /** 草稿持久化键（GLOSSARY「Queue Dock」同族的会话恢复件） */
  sessionId?: string;
}) {
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [chip, setChip] = useState<PersistedChip | null>(null);
  const [menu, setMenu] = useState<{ query: string; highlight: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastEscRef = useRef(0);
  const restoredRef = useRef(false);

  const retrying = drive?.status === "retrying";
  const busy = Boolean(drive && isBusyStatus(drive.status));
  const compacting = Boolean(drive?.compacting);

  // —— 草稿持久化（ADR-0017）：attach 后首次恢复，之后随改随存，发送即清 ——

  useEffect(() => {
    if (!drive || !sessionId || restoredRef.current) return;
    restoredRef.current = true;
    const draft = loadDraft(sessionId);
    if (draft) {
      setText(draft.text);
      if (draft.chip) setChip(draft.chip);
    }
  }, [drive, sessionId]);

  useEffect(() => {
    if (!drive || !sessionId || !restoredRef.current) return;
    if (text || chip) saveDraft(sessionId, { text, ...(chip ? { chip } : {}) });
    else clearDraft(sessionId);
  }, [text, chip, drive, sessionId]);

  // —— Trigger Menu 数据源：目录透传命令 + 内建 compact（ADR-0016） ——

  const commands: MenuCommand[] = useMemo(() => {
    const items: MenuCommand[] = (drive?.catalog?.commands ?? []).map((entry) => ({
      name: entry.name,
      trigger: entry.trigger,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.argumentHint ? { argumentHint: entry.argumentHint } : {}),
      source: entry.source,
      icon: COMMAND_ICON[entry.source],
    }));
    items.push({
      name: "compact",
      trigger: "/compact",
      description: t("cmdCompactDesc"),
      builtin: "compact",
      icon: "contract",
    });
    return items;
  }, [drive?.catalog?.commands, t]);

  const menuItems = menu ? filterCommands(commands, menu.query) : [];

  /** 输入后同步触发检测：claimed（chip 在场）时不触发 */
  const syncMenu = (value: string, caret: number) => {
    if (chip) {
      setMenu(null);
      return;
    }
    const query = detectSlashTrigger(value, caret);
    if (query === null) {
      setMenu(null);
      return;
    }
    const count = filterCommands(commands, query).length;
    setMenu({ query, highlight: count > 0 ? 0 : -1 });
  };

  const resetAfterSubmit = () => {
    setText("");
    setChip(null);
    setMenu(null);
    if (sessionId) clearDraft(sessionId);
  };

  const submit = ({ steer = false }: { steer?: boolean } = {}) => {
    if (!drive) return;
    if (chip) {
      // Command Chip 透传（内核 prompt() 解释扩展命令 / 模板 / skill）；运行中转排队——
      // 内核排队路径不做斜杠展开，此为罕见路径，接受（ADR-0016 执行语义）
      const args = text.trim();
      drive.onSend(`${chip.trigger}${args ? ` ${args}` : ""}`);
      resetAfterSubmit();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    if (steer) drive.onSteer(trimmed);
    else drive.onSend(trimmed);
    resetAfterSubmit();
  };

  const pick = (index: number) => {
    const item = menuItems[index];
    if (!item) return;
    if (item.builtin === "compact") {
      drive?.onCompact();
      resetAfterSubmit();
      return;
    }
    setChip({
      trigger: item.trigger,
      name: item.name,
      ...(item.argumentHint ? { argumentHint: item.argumentHint } : {}),
      ...(item.source ? { source: item.source } : {}),
    });
    setText("");
    setMenu(null);
    textareaRef.current?.focus();
  };

  const removeChip = () => {
    setChip(null);
    setText("");
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // IME 组合态不参与任何发送 / 菜单仲裁
    if (event.nativeEvent.isComposing) return;
    // 按住回车连发：第二拍起吞掉（dsh 口径）
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      return;
    }
    if (menu) {
      const count = menuItems.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (count === 0) return;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setMenu((current) =>
          current
            ? { ...current, highlight: (current.highlight + delta + count) % count }
            : current,
        );
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        pick(menu.highlight >= 0 ? menu.highlight : 0);
        return;
      }
      // Enter：有高亮即选中；无高亮 / 无条目穿透为普通提交（走下方分支）
      if (event.key === "Enter" && menu.highlight >= 0 && count > 0) {
        event.preventDefault();
        pick(menu.highlight);
        return;
      }
    }
    if (event.key === "Enter") {
      if (event.shiftKey) return; // 默认换行
      event.preventDefault();
      submit({ steer: event.ctrlKey || event.metaKey });
      return;
    }
    if (chip && event.key === "Backspace" && text.length === 0) {
      // claimed 态唯一退出（dsh 口径）：空参数退格删 chip
      event.preventDefault();
      removeChip();
    }
  };

  // —— Esc 统一仲裁（窗口捕获）：关触发菜单 → 让位其它浮层 → claimed 不理 → 双击中断 ——

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // 只接管 composer 聚焦域（含 body）：别劫持侧栏搜索等无关焦点
      const active = document.activeElement;
      const inComposer = active instanceof Node && (cardRef.current?.contains(active) ?? false);
      if (!inComposer && active !== document.body) return;
      if (menu) {
        setMenu(null); // 第一拍：只关菜单，不计入口令
        return;
      }
      // 模型 / thinking 浮层自带 Esc（capture + stopPropagation），这里仅让位不计口令
      if (hasOpenMenuSurface()) return;
      if (chip) return; // claimed：删除 chip 是唯一退出（dsh 口径）
      if (!busy) return;
      const now = Date.now();
      if (now - lastEscRef.current < 500) {
        lastEscRef.current = 0;
        drive?.onAbort();
      } else {
        lastEscRef.current = now;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu, chip, busy, drive]);

  // —— 渲染 ——

  const placeholder = !drive
    ? t("attachHint")
    : compacting
      ? t("compactingPlaceholder")
      : retrying
        ? translateVars(locale, "retryingPlaceholder", { n: String(drive.retryAttempt ?? 1) })
        : busy
          ? t("queuePlaceholder")
          : chip
            ? t("chipArgsPlaceholder")
            : t("messagePlaceholder");

  const queueRows: QueueRow[] = [
    ...(drive?.queued?.steering ?? []).map((value) => ({ text: value, channel: "steer" as const })),
    ...(drive?.queued?.followUp ?? []).map((value) => ({ text: value, channel: "followUp" as const })),
    ...(drive?.pendingQueue ?? []).map((value) => ({ text: value, channel: "followUp" as const, pending: true })),
  ];

  const displayModel = model?.modelId ? model : drive?.catalog?.model?.current;
  const displayThinking = thinkingLevel ?? drive?.catalog?.model?.thinkingLevel;

  const bar = (
    <div className={styles.composerBar}>
      {drive && (
        <ModelSeat
          catalog={drive.catalog}
          current={displayModel}
          thinkingLevel={displayThinking}
          onSetModel={drive.onSetModel}
          onSetThinkingLevel={drive.onSetThinkingLevel}
        />
      )}
      <span className={styles.barSpacer} />
      <ContextRing usage={drive?.usage} modelLabel={displayModel?.modelId} compacting={compacting} />
      {drive && busy && (
        <Tooltip label={t("stopHint")}>
          <button
            type="button"
            className={styles.stopButton}
            aria-label={t("abort")}
            onClick={() => drive.onAbort()}
          >
            <Icon name="stop" size={13} />
          </button>
        </Tooltip>
      )}
      <Tooltip label={busy ? t("queueSendHint") : t("sendHint")}>
        <button
          type="button"
          className={styles.sendButton}
          disabled={!drive || compacting || (!chip && !text.trim())}
          onClick={() => submit()}
        >
          <Icon name="arrow-up" size={20} />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div className={variant === "overlay" ? styles.composer : styles.composerDocked}>
      {drive && <QueueDock rows={queueRows} running={busy} onRebuild={drive.onRebuildQueue} />}
      <MenuSurface
        open={menu !== null}
        onClose={() => setMenu(null)}
        placement="top"
        matchAnchorWidth
        closeOnEscape={false}
        ariaLabel={t("triggerMenuLabel")}
        // 锚 = composer 卡本体（combobox 口径：菜单与卡同宽、贴卡上方）；卡 ref
        // 双记——cardRef 供 Esc 聚焦域判定，anchorRef 供浮层定位
        trigger={(anchorRef) => (
          <div
            ref={(node) => {
              cardRef.current = node;
              anchorRef.current = node;
            }}
            className={styles.composerCard}
          >
            {chip && (
              <div className={styles.chipRow}>
                <span className={styles.commandChip}>
                  <Icon name={(chip.source && COMMAND_ICON[chip.source]) || "doc"} size={11} />
                  {chip.name}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    title={t("chipRemoveHint")}
                    aria-label={t("chipRemoveHint")}
                    onClick={removeChip}
                  >
                    <Icon name="xmark" size={9} />
                  </button>
                </span>
                {chip.argumentHint && !text && (
                  <span className={styles.chipGhost}>{chip.argumentHint}</span>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={styles.composerInput}
              placeholder={placeholder}
              rows={1}
              value={drive ? text : ""}
              disabled={!drive}
              onChange={(event) => {
                setText(event.target.value);
                syncMenu(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) => syncMenu(event.currentTarget.value, event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              role={menu ? "combobox" : undefined}
              aria-expanded={menu ? true : undefined}
              aria-controls={menu ? COMMAND_MENU_ID : undefined}
              aria-activedescendant={menu && menu.highlight >= 0 ? `${COMMAND_MENU_ID}-opt-${menu.highlight}` : undefined}
              aria-autocomplete="list"
            />
            {bar}
          </div>
        )}
      >
        <div role="listbox" id={COMMAND_MENU_ID}>
          {menuItems.length === 0 && <div className={menuStyles.empty}>{t("menuEmpty")}</div>}
          {menuItems.map((item, index) => (
            <MenuSurfaceItem
              key={`${item.trigger}-${item.name}`}
              role="option"
              id={`${COMMAND_MENU_ID}-opt-${index}`}
              selected={index === menu?.highlight}
              icon={item.icon}
              onMouseEnter={() => setMenu((current) => (current ? { ...current, highlight: index } : current))}
              // mousedown 接：焦点不离开编辑器（combobox 口径）
              onMouseDown={(event) => {
                event.preventDefault();
                pick(index);
              }}
            >
              <span className={menuStyles.itemTitle}>
                {item.name}
                {item.argumentHint && <span className={menuStyles.itemHint}>{item.argumentHint}</span>}
              </span>
              {item.description && <span className={menuStyles.itemDesc}>{item.description}</span>}
            </MenuSurfaceItem>
          ))}
        </div>
      </MenuSurface>
    </div>
  );
}

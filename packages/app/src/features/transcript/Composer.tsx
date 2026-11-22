/** Composer：会话输入区（ADR-0017 重设计；ADR-0012 补记十一懒接管；C3 搬运层拆除）。
    状态切片（DriveSession、attach 在途）经 store selector 直订（ADR-0015 修订：
    数据走订阅、动作走 props）——props 只承载绑定路由 id 的动作闭包与两个模式输入
    （foreignDriven / takeover）。五态显式状态机（lib/composer-mode，已测）：
    driven / attaching / lazy / foreign / locked，attaching 不再藏在 driven 名下。
    未驱动但有 file 的会话输入区常开（Send-to-Attach：首条发送即接管，由 DriveClient
    懒发送兑付），仅他属驱动（别的连接持属主）时禁用并提示。
    动作与状态各归其位：底栏左 = 加号（命令插入）+ Model Seat + Context Ring
    （thinking 后），右 = 发送/中断一元钮（busy 时变终止方块，中断保留队列）。
    运行态占位符化（排队 / 重试 / 压缩），双击 Esc（500ms）与终止钮等价。
    发送语义：idle → prompt（兜底 followUp），busy → followUp 排队，
    Ctrl/Cmd+Enter 显式插话。Trigger Menu（`/` 行首或加号触发）按来源分三组——
    技能、提示词、命令（内建：compact，仅本端在管态），选中落定为 Command Chip。 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SessionCatalog } from "@pi-studio/shared/protocol";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Tag } from "../../components/Tag";
import { MenuSurface, MenuSurfaceGroup, MenuSurfaceItem, hasOpenMenuSurface } from "../../components/MenuSurface";
import { Tooltip } from "../../components/Tooltip";
import { clearDraft, loadDraft, saveDraft, type PersistedChip } from "../../lib/draft-store";
import { composerCanInput, composerModeOf, placeholderStateOf, type ComposerMode } from "../../lib/composer-mode";
import { isBusyStatus } from "../../lib/drive-client";
import { cx } from "../../lib/cx";
import { translateVars, type MessageKey } from "../../lib/i18n";
import {
  detectSlashTrigger,
  filterCommands,
  groupMenuCommands,
  menuCommandsFromCatalog,
  type MenuCommand,
  type MenuCommandGroup,
} from "../../lib/trigger-menu";
import { useLocale } from "../../state/use-locale";
import { useDriveAttaching, useDriveSession, usePendingChoice, type QueuedItem } from "../../state/use-drive";
import { ContextRing } from "./ContextRing";
import { ModelSeat } from "./ModelSeat";
import { QueueDock, type QueueRow } from "./QueueDock";
import styles from "./transcript.module.css";
import menuStyles from "../../components/menu-surface.module.css";

const COMMAND_MENU_ID = "composer-trigger-menu";

/** 分组头文案映射（ADR-0016 补记三）：技能 → 提示词 → 命令（内建） */
const GROUP_LABELS: Record<MenuCommandGroup["source"], MessageKey> = {
  skill: "groupSkills",
  prompt: "groupPrompts",
  builtin: "groupCommands",
};

/** 占位符判定表（ADR-0017 状态化占位符）：判定谓词在 lib/composer-mode（已测），
    这里只把状态映射到文案键——retrying 的第 n 次经 translateVars 现场插值 */
function placeholderKey(state: ReturnType<typeof placeholderStateOf>): { key: MessageKey; retry?: boolean } | null {
  switch (state) {
    case "compacting":
      return { key: "compactingPlaceholder" };
    case "retrying":
      return { key: "retryingPlaceholder", retry: true };
    case "busy":
      return { key: "queuePlaceholder" };
    case "chip":
      return { key: "chipArgsPlaceholder" };
    default:
      return null;
  }
}

/** 输入区的动作插槽（ADR-0015 修订）：只承载绑定路由 id 的动作闭包——状态切片
    （DriveSession、attach 在途）由 Composer 经 store selector 直订，props 链不再
    中转数据。存在 = 本端在管（driven / attaching）；他属驱动与不可驱动时缺省。 */
export interface ComposerActions {
  /** 语义发送：idle → prompt；busy → followUp 排队（Queue Dock）。返回 false = 没接手
   *  （连接未就绪等），输入框与草稿不得清 */
  onSend(text: string): boolean;
  /** 显式插话（GLOSSARY「Steer」）：Ctrl/Cmd+Enter 走这 */
  onSteer(text: string): void;
  /** Queue Dock 行内操作落点（整批重编，ADR-0016） */
  onRebuildQueue(items: QueuedItem[]): void;
  onAbort(): void;
  onSetModel(provider: string, modelId: string): void;
  onSetThinkingLevel(level: string): void;
  /** 内建命令兑付（GLOSSARY Trigger Menu「命令」组，ADR-0016 补记三）：compact 等客户端本地动作 */
  onCompact(): void;
}

/** 懒接管插槽（GLOSSARY Send-to-Attach）：会话未驱动但可接管时由 SessionView 下发。
 *  语义发送（未驱动恒为 prompt 语义；attach + 补发由 DriveClient 兑付）。
 *  返回 false = 没接手（连接未就绪 / 无 file），输入框与草稿不得清 */
export interface LazyComposer {
  onSend(text: string): boolean;
  /** 浏览态选择（补记十二）：挂起待发送兑付；缓存目录在场才可达 */
  onSetModel?(provider: string, modelId: string): void;
  onSetThinkingLevel?(level: string): void;
}

export function Composer({
  model,
  thinkingLevel,
  variant = "overlay",
  actions,
  lazy,
  browsingCatalog,
  sessionId,
  foreignDriven = false,
  takeover = false,
}: {
  /** 当前模型声明（entries 派生优先；create 出的会话回落 catalog.current） */
  model?: { provider?: string; modelId?: string };
  thinkingLevel?: string;
  /** overlay：钉在 Transcript 底部；docked：文档流内（组件总览用） */
  variant?: "overlay" | "docked";
  /** 本端在管的动作插槽（driven / attaching 两态共用）：状态数据不经 props */
  actions?: ComposerActions;
  /** 未驱动但可接管时存在（GLOSSARY Send-to-Attach） */
  lazy?: LazyComposer;
  /** 浏览态 Model Seat 的目录（补记十二/十四）：驱动态不消费，未驱动时供可选菜单
      （会话缓存缺席时由 SessionView 以全局目录兜底） */
  browsingCatalog?: SessionCatalog;
  /** 草稿持久化键（GLOSSARY「Queue Dock」同族的会话恢复件） */
  sessionId?: string;
  /** 他属驱动（REST driven 标志 × 本端驱动表）：输入区禁用并提示 */
  foreignDriven?: boolean;
  /** 可懒接管：file 在场（Send-to-Attach 的接管依据） */
  takeover?: boolean;
}) {
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [chip, setChip] = useState<PersistedChip | null>(null);
  const [menu, setMenu] = useState<{ query: string; highlight: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastEscRef = useRef(0);
  const restoredRef = useRef(false);

  // —— 状态切片直订（ADR-0015 修订）：DriveSession 与 attach 在途是全局订阅层的数据，
  //    不再经 props 搬运（原 ComposerDrive 16 字段镜像由 SessionView 每渲染内联新建，
  //    delta 帧换新对象使下游 memo 依赖恒失效——搬运层拆除后此痼疾随之消失） ——
  const driveSession = useDriveSession(sessionId);
  const attaching = useDriveAttaching(sessionId);
  // 输入区的一元状态机（lib/composer-mode，已测）：attaching 显式入态，
  // driven 态名下不再藏 driven-or-attaching；连接就绪度不入态（断线时输入区依设计保持可用，
  // 就绪与否只在发送瞬间由 sendText 兜底，不改变任何渲染分支）
  const mode: ComposerMode = composerModeOf({
    driven: driveSession != null,
    attaching,
    takeover,
    foreignDriven,
  });
  const foreign = mode === "foreign";
  const canInput = composerCanInput(mode);
  const busy = Boolean(driveSession && isBusyStatus(driveSession.status));
  const compacting = Boolean(driveSession?.compacting);

  // —— 草稿持久化（ADR-0017）：可输入即恢复（含懒接管的浏览态），之后随改随存，发送即清 ——

  useEffect(() => {
    if (!canInput || !sessionId || restoredRef.current) return;
    restoredRef.current = true;
    const draft = loadDraft(sessionId);
    if (draft) {
      setText(draft.text);
      if (draft.chip) setChip(draft.chip);
    }
  }, [canInput, sessionId]);

  useEffect(() => {
    if (!canInput || !sessionId || !restoredRef.current) return;
    if (text || chip) saveDraft(sessionId, { text, ...(chip ? { chip } : {}) });
    else clearDraft(sessionId);
  }, [text, chip, canInput, sessionId]);

  // —— Trigger Menu 数据源：目录透传（skills / prompt 模板）+ 内建命令（「命令」组，
  //    ADR-0016 补记三，仅驱动态——compact 的兑付通道在驱动连接上，浏览态无路径）。
  //    驱动态目录随 attached 帧在场；浏览态退会话缓存 / 全局目录兜底（补记十五） ——

  const commands: MenuCommand[] = useMemo(() => {
    const cataloged = menuCommandsFromCatalog(driveSession?.catalog?.commands ?? browsingCatalog?.commands ?? []);
    // builtin 命令的描述走 i18n（纯逻辑层不持文案），故在此构造；仅本端在管入菜单
    // （compact 的兑付通道在驱动连接上——attaching 空窗也能兑付，attach 先到）
    const managed = driveSession != null;
    const builtin: MenuCommand[] = managed
      ? [{ name: "compact", trigger: "/compact", description: t("cmdCompactDesc"), source: "builtin" }]
      : [];
    return [...cataloged, ...builtin];
  }, [driveSession?.catalog?.commands, browsingCatalog?.commands, t, driveSession != null]);

  /** 展示序 = 分组序（技能在前、提示词在后），高亮下标即该序的下标 */
  const menuGroups = useMemo(
    () => groupMenuCommands(menu ? filterCommands(commands, menu.query) : []),
    [commands, menu],
  );
  const menuItems = useMemo(() => menuGroups.flatMap((group) => group.items), [menuGroups]);

  /** 输入后同步触发检测：claimed（chip 在场）或不可输入（他属驱动 / 不可驱动）时不触发 */
  const syncMenu = (value: string, caret: number) => {
    if (chip || !canInput) {
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
    if (!canInput) return;
    // 统一取发送文本：chip → 命令透传串（Command Chip 由内核 prompt() 解释扩展命令 /
    // 模板 / skill）；正文 → trim 后的输入
    const outgoing = chip
      ? `${chip.trigger}${text.trim() ? ` ${text.trim()}` : ""}`
      : text.trim();
    if (!outgoing) return;
    // 没接手的发送（连接未就绪）不清草稿——否则用户刚写的字被静默吐掉
    let accepted = false;
    if (actions && chip?.source === "builtin") {
      // 内建命令（compact）：客户端本地动作，不透传内核 prompt()（内核不解释 /compact）；
      // 参数文本一并弃置（compact 无参）。浏览态无兑付通道——菜单本就不列（见 commands）
      actions.onCompact();
      accepted = true;
    } else if (actions) {
      // chip 透传不走插话（内核排队路径不做斜杠展开，罕见路径接受，ADR-0016 执行语义）
      if (steer && !chip) {
        actions.onSteer(outgoing);
        accepted = true;
      } else {
        accepted = actions.onSend(outgoing);
      }
    } else {
      // 未驱动（懒接管）：无运行态，插话语义不存在，恒走发送（attach + 补发在 DriveClient）
      accepted = lazy?.onSend(outgoing) ?? false;
    }
    if (accepted) resetAfterSubmit();
  };

  const pick = (index: number) => {
    const item = menuItems[index];
    if (!item) return;
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
        actions?.onAbort();
      } else {
        lastEscRef.current = now;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu, chip, busy, actions]);

  // —— 渲染 ——

  // 占位符：禁用态走 mode 分流（他属 / 不可驱动），可输入态走判定表
  // （lib/composer-mode 的优先级 compacting > retrying > busy > chip，显式成序）
  const disabledHint = !canInput ? (foreign ? t("drivenByOtherHint") : t("undrivableHint")) : null;
  const placeholderHint = disabledHint ?? (() => {
    const state = placeholderStateOf(driveSession, chip != null, canInput);
    const hint = placeholderKey(state);
    if (!hint) return t("messagePlaceholder");
    return hint.retry
      ? translateVars(locale, hint.key, { n: String(driveSession?.retryAttempt ?? 1) })
      : t(hint.key);
  })();
  const placeholder = placeholderHint;

  const queueRows: QueueRow[] = [
    ...(driveSession?.queued?.steering ?? []).map((value) => ({ text: value, channel: "steer" as const })),
    ...(driveSession?.queued?.followUp ?? []).map((value) => ({ text: value, channel: "followUp" as const })),
    ...(driveSession?.pendingQueue ?? []).map((value) => ({ text: value, channel: "followUp" as const, pending: true })),
  ];

  // 浏览态（补记十二）：挂起选择乐观覆盖 entries 派生值；驱动态不消费挂起选择
  // （真通道 setModel 后由 model_change 权威条目刷新，挂起残留不得回染）
  const browsing = mode === "lazy";
  const pendingChoice = usePendingChoice(sessionId);
  const displayModel =
    browsing && pendingChoice?.modelId
      ? { ...(pendingChoice.provider ? { provider: pendingChoice.provider } : {}), modelId: pendingChoice.modelId }
      : model?.modelId
        ? model
        : driveSession?.catalog?.model?.current;
  const displayThinking =
    browsing && pendingChoice?.thinkingLevel !== undefined
      ? pendingChoice.thinkingLevel
      : (thinkingLevel ?? driveSession?.catalog?.model?.thinkingLevel);

  // 模型 / 档位切换的唯一分流点（本端在管走真通道，浏览态走挂起选择）——两粒按钮共用，
  // 不在 JSX 里两份三元各写一遍
  const selectModel = (provider: string, modelId: string) =>
    actions ? actions.onSetModel(provider, modelId) : lazy?.onSetModel?.(provider, modelId);
  const selectThinkingLevel = (level: string) =>
    actions ? actions.onSetThinkingLevel(level) : lazy?.onSetThinkingLevel?.(level);

  const bar = (
    <div className={styles.composerBar}>
      {/* 底栏左 = 加号（命令插入，领先于模型钮，ADR-0017）+ Model Seat + Context Ring。
          Model Seat 恒渲染：驱动态目录随 attached 帧在场；浏览态退读缓存目录（补记十二）
          或全局目录兜底（补记十四），选择挂起随首条发送兑付；目录缺席内部自动禁为只读
          展示；他属驱动 / 不可驱动恒禁（选择无兑付路径）——底栏信息不随接管时机消失。
          加号与 `/` 同一 Trigger Menu：驱动态随 attached 帧，浏览态随缓存/全局目录
          （补记十五），有命令可选才在场 */}
      <ModelSeat
        catalog={driveSession?.catalog ?? browsingCatalog}
        current={displayModel}
        thinkingLevel={displayThinking}
        disabled={mode === "foreign" || mode === "locked"}
        disabledHint={foreign ? t("drivenByOtherHint") : undefined}
        onSetModel={selectModel}
        onSetThinkingLevel={selectThinkingLevel}
        addon={
          canInput && commands.length > 0 && (
            <Tooltip label={t("insertCommandHint")}>
              <Button
                icon="plus"
                iconSize={11}
                className={styles.plusButton}
                aria-label={t("insertCommandHint")}
                onClick={() => setMenu((current) => (current ? null : { query: "", highlight: 0 }))}
              />
            </Tooltip>
          )
        }
      />
      {/* Context Ring：thinking tag 之后（视觉简化轮）；usage 缺席（未驱动）不渲染 */}
      <ContextRing usage={driveSession?.usage} modelLabel={displayModel?.modelId} compacting={compacting} />
      <span className={styles.barSpacer} />
      {/* 发送 / 中断一元钮：busy 时变终止方块（原独立 Stop 钮撤销，中断保留队列） */}
      <Tooltip label={foreign ? t("drivenByOtherHint") : busy ? t("stopHint") : t("sendHint")}>
        <Button
          icon={busy ? "stop" : "arrow-up"}
          iconSize={busy ? 16 : 24}
          className={cx(styles.sendButton, busy && styles.stopButton)}
          disabled={!canInput || compacting || (!busy && !chip && !text.trim())}
          aria-label={busy ? t("abort") : t("sendHint")}
          onClick={() => (busy ? actions?.onAbort() : submit())}
        />
      </Tooltip>
    </div>
  );

  return (
    <div className={variant === "overlay" ? styles.composer : styles.composerDocked}>
      {driveSession && actions && (
        <QueueDock rows={queueRows} running={busy} onRebuild={actions.onRebuildQueue} />
      )}
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
                <Tag pill tone="accent" className={styles.commandChip}>
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
                </Tag>
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
              value={canInput ? text : ""}
              disabled={!canInput}
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
          {menuGroups.map((group) => (
            <MenuSurfaceGroup
              key={group.source}
              label={t(GROUP_LABELS[group.source])}
            >
              {group.items.map((item) => {
                const index = menuItems.indexOf(item);
                return (
                  <MenuSurfaceItem
                    key={`${item.trigger}-${item.name}`}
                    role="option"
                    id={`${COMMAND_MENU_ID}-opt-${index}`}
                    selected={index === menu?.highlight}
                    onMouseEnter={() => setMenu((current) => (current ? { ...current, highlight: index } : current))}
                    // mousedown 接：焦点不离开编辑器（combobox 口径）
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(index);
                    }}
                  >
                    <span className={cx("ellipsis", menuStyles.itemTitle)}>
                      {item.name}
                      {item.argumentHint && <span className={menuStyles.itemHint}>{item.argumentHint}</span>}
                    </span>
                    {item.description && (
                      <span className={cx("ellipsis", menuStyles.itemDesc)}>{item.description}</span>
                    )}
                  </MenuSurfaceItem>
                );
              })}
            </MenuSurfaceGroup>
          ))}
        </div>
      </MenuSurface>
    </div>
  );
}

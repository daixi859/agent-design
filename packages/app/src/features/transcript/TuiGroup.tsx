/** TUI Mode 的 Process Group 渲染（ADR-0014）：终端模拟风格，动态运行渲染的专属载体。
 *
 *  头部摘要行：`▸ running... · 12s · bash×2 read×3`（运行态，扫光跑马灯）
 *           → `▸ Ran for 3.2s · bash×2 · 1 failed`（结算态；运行结束 250ms 静默期自动收起，
 *              用户手动展开过的不收）
 *  槽位行：`<spinner> bash fix-lint.sh · 12s`，行内秒数锚条目时间戳、挂钟现场求值；
 *  计时 tick 只触发重绘（100ms），取值一律现场 Date.now()，不存秒数 state——
 *  秒随挂钟自然推进，定时器丢失也不卡死。
 *  字形纪律（迭代）：符号一律 SVG 绘制、收进 Icon 组件（check / spinner / xmark），
 *  不用文本字符——等宽栈的字体回退会让 ▸ ✓ ↳ 渲染不一致；
 *  spinner 的旋转是 CSS 动画，不占挂钟帧。运行中组默认紧凑态：槽位区只亮最后一个
 *  活动条目，点开头部才全量；活跃思考只有最后一条（其前的早已完成），只报流逝秒数。
 *  本组件只读 TranscriptModel 派生量，不读内核字段。 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/useLocale";
import { translateVars } from "../../lib/i18n";
import { formatDuration } from "../../lib/format";
import { useTuiThinkLines } from "../../state/useTuiThinkLines";
import { useStickToBottom } from "../../state/useStickToBottom";
import type {
  GroupItem,
  GroupRecap,
  ToolCallItem,
  ToolState,
} from "../../lib/transcript-model";
import styles from "./tui.module.css";

/** 秒数重绘节奏：一位小数秒的展示精度，100ms tick 足够（字形动画走 CSS，不占 tick） */
const REDRAW_INTERVAL_MS = 100;
/** 分类计数截断：前 3 类 + …+N（ADR-0014） */
const COUNTS_SHOWN = 3;
/** 运行结束 → 自动收起的静默期（与 cc-extensions 的 FOLD_SETTLE_MS 对齐） */
const FOLD_SETTLE_MS = 250;

/** 汇总行时刻：本轮完成时刻的本地短时间（cc-style 的 `1:56 PM`） */
function formatClock(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(at);
}

/** 汇总行日期：月/日（cc-style 的 `11/17`，与时刻空格相连） */
function formatDate(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(at);
}

/** 结算 turn 的汇总行（ADR-0014 迭代）：`Run {n} commands[ · {m} thinking] · {一轮时间} ·
    done {月/日 时刻}` 一轮一行——结论段整合命令数与思考数（纯思考轮只有 thinking、
    无思考只 commands）；done 后跟完成日期与时刻、两者间无点（cc 原样）；
    点击切换各组明细行的显隐（这是 turn 级结构，组头部不承担汇总） */
export function TuiTurnSummary({
  count,
  thoughts,
  durationMs,
  endAt,
  open,
  onToggle,
}: {
  count: number;
  /** 本轮思考总数（结论段的 thinking 段） */
  thoughts: number;
  /** 一轮时间（turn 结算耗时） */
  durationMs?: number;
  /** 完成时刻（本轮末条目时间戳） */
  endAt?: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { locale } = useLocale();
  const lead = [
    count > 0 ? translateVars(locale, "tuiRunTotal", { n: String(count) }) : null,
    thoughts > 0 ? translateVars(locale, "tuiThinkingCount", { n: String(thoughts) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      className={cx(styles.head, styles.summaryRow)}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className={styles.chevron} data-open={open || undefined}>
        <Icon name="chevron-right" size={12} />
      </span>
      {lead && <span className={styles.dim}>{lead}</span>}
      {durationMs !== undefined && (
        <span className={styles.dim}>· {formatDuration(durationMs, locale)}</span>
      )}
      {endAt !== undefined && (
        <span className={styles.dim}>
          ·{" "}
          {translateVars(locale, "tuiDoneAt", {
            date: formatDate(endAt, locale),
            time: formatClock(endAt, locale),
          })}
        </span>
      )}
    </button>
  );
}

/** 运行期挂钟：100ms tick 只触发重绘；非运行期返回 undefined（定格、不空转） */
function useLiveClock(active: boolean): number | undefined {
  const [now, setNow] = useState<number | undefined>();
  useEffect(() => {
    if (!active) {
      setNow(undefined);
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), REDRAW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** 槽位状态字形：一律 Icon 组件的 SVG 字形（ADR-0014 迭代：含 spinner 圆弧，
    旋转由 CSS .iconRun 驱动、只在组容器 [data-live] 作用域转——历史残留 running 组
    的字形定格）；stopped = CSS 圆点；未知状态留空占位（不伪造）。
    与 ToolRow 的 STATE_VIEW 同词汇、不同呈现（Standard 文字+图标 / TUI 纯 SVG 字形），
    不强行收编一张表：新增状态时两处同步。 */
function StatusGlyph({ state }: { state?: ToolState }) {
  if (state === "running") {
    return (
      <span className={cx(styles.icon, styles.iconRun)}>
        <Icon name="spinner" size={10} />
      </span>
    );
  }
  if (state === "ok") {
    return (
      <span className={cx(styles.icon, styles.iconOk)}>
        <Icon name="check" size={10} />
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className={cx(styles.icon, styles.iconError)}>
        <Icon name="xmark" size={10} />
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className={cx(styles.icon, styles.dim)}>
        <span className={styles.dotGlyph} />
      </span>
    );
  }
  return <span className={styles.icon} />;
}

/** 槽位行展开体（迭代：cc-style Input/Output 分区）：树形竖线缩进贯穿，
 *  Input = args 键值行式（字符串值直书，结构化值走 JSON），Output = diff + 输出
 *  （运行中优先实时尾巴，无尾巴显示 Pending... 占位——Live Tail 路径无 update 流） */
function TuiSlotBody({ item }: { item: ToolCallItem }) {
  const { t, locale } = useLocale();
  const running = item.state === "running";
  // 输出：运行中取实时尾巴（驱动路径独有；Live Tail 无尾巴显示占位），结算为权威落盘输出
  const output = running ? (item.live?.outputTail ?? t("tuiPending")) : item.output;
  const growing =
    running && item.live?.totalLen !== undefined && item.live.totalLen > (item.live.outputTail?.length ?? 0);
  const diff = item.diff ?? item.patch;
  // cc 风格 Input：键值行式（command: ls …），不是 JSON 块；命令类工具同样走 command 键
  const inputLines = item.terminal
    ? [`command: ${item.terminal.command}`]
    : item.args
      ? Object.entries(item.args).map(
          ([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
        )
      : [];
  return (
    <div className={styles.slotBody}>
      {inputLines.length > 0 && (
        <>
          <span className={cx(styles.name, styles.bodyLabel)}>{t("tuiInput")}</span>
          <pre className={styles.bodyPre}>{inputLines.join("\n")}</pre>
        </>
      )}
      {(diff || output || growing) && (
        <>
          <span className={cx(styles.name, styles.bodyLabel)}>{t("tuiOutput")}</span>
          {diff && <pre className={styles.bodyPre}>{diff}</pre>}
          {output && <pre className={styles.bodyPre}>{output}</pre>}
          {growing && (
            <span className={styles.dim}>
              {translateVars(locale, "tuiOutputGrowing", { n: String(item.live!.totalLen!) })}
            </span>
          )}
        </>
      )}
      {item.subCalls?.map((call) => (
        <div key={call.id} className={cx(styles.slot, styles.subCall)}>
          <StatusGlyph state={call.status} />
          {call.name}
          {call.summary ? ` ${call.summary}` : ""}
        </div>
      ))}
    </div>
  );
}

/** 槽位行：`<引导线> <状态字形> <工具名> <参数摘要> · <秒数>`，点击展开/收起展开体 */
function TuiSlot({ item, now, locale }: { item: ToolCallItem; now: number | undefined; locale: string }) {
  const [open, setOpen] = useState(false);
  const running = item.state === "running";
  // 行内秒数（ADR-0014 对 Standard「行内无耗时」的 TUI 专属规则）：
  // 运行中 = 挂钟 − 条目时间戳锚（双路径统一）；结算 = 内核 durationMs；都没有就不显示
  const elapsed =
    running && now !== undefined && item.startedAt !== undefined
      ? formatDuration(Math.max(0, now - item.startedAt), locale)
      : !running && item.durationMs !== undefined
        ? formatDuration(item.durationMs, locale)
        : undefined;
  return (
    <>
      <button
        type="button"
        className={styles.slot}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.lead} />
        <StatusGlyph state={item.state} />
        <span className={styles.name}>{item.name}</span>
        {item.summary && <span className={styles.summary}>{item.summary}</span>}
        {elapsed && (
          <span className={styles.elapsed}>
            · {elapsed}
          </span>
        )}
      </button>
      {open && <TuiSlotBody item={item} />}
    </>
  );
}

/** 思考行：静止 = 单行首行摘要（字色与工具名同档最强，可点击展开全文）+
    请求耗时（内核 durationMs，思考占其主体）；活跃（流式中）= spinner + 思考中标签 +
    流逝秒数 + 尾部滚动折行后的末 N 个视觉行（行数可配置；内容置于标签行下方） */
function TuiThinking({
  item,
  active,
  now,
  locale,
  tailLines,
}: {
  item: Extract<GroupItem, { kind: "thinking" }>;
  active: boolean;
  now: number | undefined;
  locale: string;
  tailLines: number;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  if (!active) {
    return (
      <>
        <button
          type="button"
          className={styles.slot}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.lead} />
          <span className={styles.icon}>
            <span className={styles.dotGlyph} />
          </span>
          <span className={styles.thinkSummary}>{item.thinking.split("\n")[0]}</span>
          {item.durationMs !== undefined && (
            <span className={styles.elapsed}>· {formatDuration(item.durationMs, locale)}</span>
          )}
        </button>
        {open && (
          <div className={styles.slotBody}>
            <pre className={styles.bodyPre}>{item.thinking}</pre>
          </div>
        )}
      </>
    );
  }
  // 尾部滚动（cc-style 的活动思考）：DOM 只装末 N 个源码行（滤空后），
  // 交给一个 pre-wrap 元素自然折行——折行结果至少 N 个视觉行，
  // CSS 端（.thinkBody 的 max-height + flex-end）再裁出末 N 个视觉行。
  // 视觉行窗口必落在末 N 源码行内：每源码行至少占 1 视觉行，更早的行
  // 早已把窗口推出界外，故截断版与全量渲染逐行同像，但 DOM 文本量
  // 与思考总长无关（delta 推进时新行自底部进入、旧行上滚出顶，tail -f 语义）。
  // 源码行仍滤空，段间空行不占视觉行配额
  const text = item.thinking
    .split("\n")
    .filter((line) => line.trim())
    .slice(-Math.max(1, tailLines))
    .join("\n");
  const elapsed =
    now !== undefined && item.startedAt !== undefined
      ? formatDuration(Math.max(0, now - item.startedAt), locale)
      : undefined;
  // 内容块置于「思考中」行下方（迭代反馈）：同行右侧会把文本挤成窄条
  return (
    <div className={styles.thinkRun}>
      <div className={cx(styles.slot, styles.dim)}>
        <span className={styles.lead} />
        <span className={cx(styles.icon, styles.iconRun)}>
          <Icon name="spinner" size={10} />
        </span>
        <span className={styles.thinkLabel}>{t("tuiThinkingRunning")}</span>
        {elapsed && <span className={styles.elapsed}>· {elapsed}</span>}
      </div>
      <div
        className={styles.thinkBody}
        style={{ "--think-tail-lines": tailLines } as CSSProperties}
      >
        {text}
      </div>
    </div>
  );
}

/** 组容器：头部摘要行 + 槽位区；运行中紧凑态（只亮最后一个活动条目，点开全量）、
    结束自动收起——用户手动展开过的保持展开（ADR-0014 迭代） */
export function TuiGroup({
  group,
  recap,
  drafting = false,
  live = false,
  isTurnTail = true,
  startedAt,
}: {
  group: GroupItem[];
  recap: GroupRecap;
  /** 本组仍挂在流式草稿上（Turn.draft 的末组）：头部同样呈运行态 */
  drafting?: boolean;
  /** 本轮仍在驱动运行（turn 级）：纯思考流式期（组内无 running 工具）也亮运行态 */
  live?: boolean;
  /** 是否 turn 的当前尾部（ADR-0014）：正文 text 流出会 flush 组——组被终结后
      组内思考即便排组内末位也已完成，活跃思考权以此为前提（真路径由 TurnView 判定） */
  isTurnTail?: boolean;
  /** 外部计时锚（ADR-0014 迭代）：首 token 前的空窗组没有条目，锚在 user 条目时刻 */
  startedAt?: number;
}) {
  const running = recap.running;
  // 「运行中」只在真运行的上下文亮（迭代收敛）：末轮 live / 流式草稿。
  // 历史残留 running 组（中断会话的末组）按结算态呈现——挂钟硬算会得出天文秒数
  const liveHeader = drafting || live;
  // 运行中默认「紧凑态」（迭代反馈）：槽位区只亮最后一个活动条目，点开头部才全量——
  // 长运行平铺全部工具行会淹没当前活动；open 即用户要的全量
  const [open, setOpen] = useState(false);
  /** 用户是否手动开关过：手动展开过的组在运行结束后保持展开（ADR-0014） */
  const userToggled = useRef(false);
  const now = useLiveClock(liveHeader);
  const [thinkLines] = useTuiThinkLines();
  const { t, locale } = useLocale();
  const anchor = startedAt ?? recap.startedAt;
  const lastItem = group[group.length - 1];
  // 活跃思考唯一化（迭代反馈）：只有「组是 turn 尾部」且组内最后一个条目是思考且
  // 思考尚未定稿（内核 thinking_end，ADR-0012 补记九）时它才活跃——正文 text 流出
  // 或思考块闭合都意味着思考已完成；其余思考一律静止呈现
  const activeThinkingId =
    liveHeader && isTurnTail && lastItem?.kind === "thinking" && !lastItem.thinkingComplete
      ? lastItem.id
      : undefined;
  // 紧凑态亮「最后一个活动条目」（ADR-0014）：倒序找 running 工具，活跃思考次之；
  // 全静止（历史残留组、纯思考组在活头部）兜底末条——并行调用乱序完成时不亮已结算项
  const compactItem =
    [...group]
      .reverse()
      .find((item) =>
        item.kind === "toolCall"
          ? item.state === "running"
          : item.id === activeThinkingId,
      ) ?? lastItem;
  const slotsRef = useRef<HTMLDivElement | null>(null);
  // 槽位区贴底跟随（useStickToBottom）：展开即贴底（用户点开要的是末尾的活动条目）；
  // 新槽位追加与思考内容增长（重绘 tick）只近底跟随——上滑越过阈值即放手，
  // 不与用户抢滚动条（ref 赋值即时生效，不参与渲染）
  const { stick: stickSlots, snap: snapSlots, onScroll: onSlotsScroll } =
    useStickToBottom(slotsRef);

  useEffect(() => {
    if (open) snapSlots();
  }, [open, snapSlots]);

  useEffect(() => {
    stickSlots();
  }, [group.length, now, stickSlots]);

  useEffect(() => {
    // 运行中保持紧凑态（不强制展开）；live→false 边沿收起，用户手动开过的不收
    if (liveHeader || userToggled.current) return;
    const timer = setTimeout(() => setOpen(false), FOLD_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [liveHeader]);

  const elapsed =
    liveHeader && anchor !== undefined && now !== undefined
      ? formatDuration(Math.max(0, now - anchor), locale)
      : undefined;
  const shown = recap.toolCounts.slice(0, COUNTS_SHOWN);
  const rest = recap.toolCounts.length - shown.length;

  return (
    <div className={styles.group} data-live={liveHeader || undefined}>
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        onClick={() => {
          userToggled.current = true;
          setOpen((value) => !value);
        }}
      >
        <span className={styles.chevron} data-open={open || undefined}>
          <Icon name="chevron-right" size={12} />
        </span>
        {liveHeader ? (
          <>
            <span className={styles.runLabel}>{t("tuiRunning")}</span>
            {elapsed && <span className={styles.elapsed}>· {elapsed}</span>}
          </>
        ) : (
          <>
            {recap.durationMs !== undefined && (
              <span className={styles.dim}>
                {translateVars(locale, "tuiRanFor", { t: formatDuration(recap.durationMs, locale) })}
              </span>
            )}
            {/* 纯思考组（迭代反馈）：无工具调用也要报思考数，头部不能空白 */}
            {recap.thoughts > 0 && (
              <span className={styles.dim}>
                · {recap.thoughts} {t(recap.thoughts === 1 ? "thoughtCount" : "thoughtCountPlural")}
              </span>
            )}
          </>
        )}
        {/* 统计项之间以 · 分隔（迭代反馈）：耗时 · 思考数 · 计数 · … · 失败 */}
        {shown.map(({ name, count }) => (
          <span key={name} className={styles.dim}>
            · {name}×{count}
          </span>
        ))}
        {rest > 0 && (
          <span className={styles.dim}>· {translateVars(locale, "tuiMoreTools", { n: String(rest) })}</span>
        )}
        {recap.failed > 0 && (
          <span className={styles.failed}>
            · {recap.failed} {t("failedCount")}
          </span>
        )}
        {drafting && !running && <span className={styles.dim}>· {t("draft")}</span>}
      </button>
      {/* 槽位区：open = 全量（限高 40vh 贴底滚动；运行中已完成思考收起——
          它的产出会体现在后续回答里，结算后恢复完整）；运行中未点开 = 紧凑态只亮
          最后一个活动条目（spinner 态）；结算未展开 = 不渲染 */}
      {(open || (liveHeader && compactItem !== undefined)) && (
        <div className={styles.slots} ref={slotsRef} onScroll={onSlotsScroll}>
          {(open
            ? liveHeader
              ? group.filter((item) => item.kind !== "thinking" || item.id === activeThinkingId)
              : group
            : [compactItem]
          ).map((item) =>
            item.kind === "thinking" ? (
              <TuiThinking
                key={item.id}
                item={item}
                active={item.id === activeThinkingId}
                now={now}
                locale={locale}
                tailLines={thinkLines}
              />
            ) : (
              <TuiSlot key={item.id} item={item} now={now} locale={locale} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

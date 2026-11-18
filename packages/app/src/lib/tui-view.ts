/** TUI 运行态派生的家（ADR-0014；C4 加深）：TUI 形态专属的判定全部在此——
 *  输入纯数据（TranscriptModel 派生量 + now + 布尔），输出结果；无 hook 无 DOM，
 *  组件只读结果。此前这些判定内联在 Transcript / TurnView / TuiGroup 组件体里，
 *  与计时 hook 纠缠而不可测；运行秒数的三段式规则也曾三处各写一遍。
 *  计时纪律不变：tick 只触发重绘，取值现场传入的 now（挂钟），本层不存秒数 state。 */
import { formatDuration } from "./format";
import type { Locale } from "./i18n";
import type { GroupItem, Turn } from "./transcript-model";

/** 活跃思考唯一化（迭代反馈）：只有「liveHeader」且「组是 turn 尾部」且组内最后一个
 *  条目是思考且思考尚未定稿（内核 thinking_end，ADR-0012 补记九）时它才活跃——
 *  正文 text 流出或思考块闭合都意味着思考已完成；其余思考一律静止呈现 */
export function activeThinkingIdOf(
  group: readonly GroupItem[],
  liveHeader: boolean,
  isTurnTail: boolean,
): string | undefined {
  const last = group[group.length - 1];
  return liveHeader && isTurnTail && last?.kind === "thinking" && !last.thinkingComplete
    ? last.id
    : undefined;
}

/** 紧凑态亮「最后一个活动条目」（ADR-0014）：倒序找 running 工具，活跃思考次之；
 *  全静止（历史残留组、纯思考组在活头部）兜底末条——并行调用乱序完成时不亮已结算项 */
export function compactItemOf(
  group: readonly GroupItem[],
  activeThinkingId: string | undefined,
): GroupItem | undefined {
  if (group.length === 0) return undefined;
  return (
    [...group]
      .reverse()
      .find((item) =>
        item.kind === "toolCall" ? item.state === "running" : item.id === activeThinkingId,
      ) ?? group[group.length - 1]
  );
}

/** 行内秒数（ADR-0014 对 Standard「行内无耗时」的 TUI 专属规则）：运行中 = 挂钟 −
 *  条目时间戳锚（双路径统一）；结算 = 内核 durationMs；都没有就不报 */
export function slotElapsedOf(
  item: { state: string; startedAt?: number; durationMs?: number },
  now: number | undefined,
  locale: Locale,
): string | undefined {
  if (item.state === "running") {
    return now !== undefined && item.startedAt !== undefined
      ? formatDuration(Math.max(0, now - item.startedAt), locale)
      : undefined;
  }
  return item.durationMs !== undefined ? formatDuration(item.durationMs, locale) : undefined;
}

/** 活动思考行的流逝秒数（运行中专用：挂钟 − startedAt 锚；无锚不报） */
export function thinkingElapsedOf(
  startedAt: number | undefined,
  now: number | undefined,
  locale: Locale,
): string | undefined {
  return now !== undefined && startedAt !== undefined
    ? formatDuration(Math.max(0, now - startedAt), locale)
    : undefined;
}

/** 组头秒数：仅运行态头部（liveHeader）挂钟求值，锚缺省不报 */
export function groupElapsedOf(
  anchor: number | undefined,
  liveHeader: boolean,
  now: number | undefined,
  locale: Locale,
): string | undefined {
  return liveHeader && anchor !== undefined && now !== undefined
    ? formatDuration(Math.max(0, now - anchor), locale)
    : undefined;
}

/** TUI 贴底抽取判定（ADR-0014 迭代）：仅 TUI 模式的末轮且（驱动运行中或流式草稿）才有
 *  贴底组——目标组是模型派生量 Turn.tailGroupId，这里只决定是否消费；首 token 前的
 *  空窗（turn 已存在但还没有任何组）回 pendingAnchorAt = user 条目时刻作计时锚。
 *  历史残留 running 组不动（不发明「已死」态）。 */
export function tuiDetachOf(
  turn: Turn | undefined,
  live: boolean,
  isTui: boolean,
): { groupId?: string; pendingAnchorAt?: number } {
  if (!isTui || !turn || (!live && !turn.draft)) return {};
  if (turn.tailGroupId) return { groupId: turn.tailGroupId };
  return turn.userAt !== undefined ? { pendingAnchorAt: turn.userAt } : {};
}

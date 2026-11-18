/** 驱动视图的合成（ADR-0012 补记）：基线（REST 全量 / create 回包快照）× 驱动条目，
    按 id 幂等归并后经同一 buildTranscriptModel 出口。

    记忆化放在这里而不是 hook 里的 useMemo——这是刻意的：
    「memo 依赖必须带基线」这条曾以 ref 形式回归过一次（基线不响应 → 视图永久 undefined）。
    依赖数组是可以写错的，函数内部按参数身份缓存则写不错：
    任何一参数引用变了就重算，调用侧根本没有依赖数组可漏。 */
import type { SessionEntry, SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { DriveSession, StreamingToolCall } from "./drive-client";
import { mergeEntries, pendingPromptEntries, streamingEntries, STREAMING_ENTRY_ID } from "./drive-client";
import {
  activeLeafId,
  buildTranscriptModel,
  type DraftThinking,
  type LiveTools,
  type TranscriptModel,
} from "./transcript-model";

/** baseline 为 null 时给缓存槽的占位：undefined 已被「尚未计算」占用 */
const NO_BASELINE = Symbol("no-baseline");

/** 单槽缓存：同时挂载多个 session 时只影响命中率，不影响正确性 */
let lastDriveSession: DriveSession | undefined;
let lastBaseline: SessionSnapshot | null | typeof NO_BASELINE = NO_BASELINE;
let lastView: TranscriptModel | undefined;

/** 驱动状态 → 运行中工具的实时尾巴表（ADR-0012 补记八）：
 *  只搬有 outputTail 的调用，无尾巴时返回 undefined（省一次出口重算的语义负担）。
 *  按 streamingToolCalls 引用记忆化（C6）：驱动归约对集合不变帧返回原引用，
 *  记忆化命中使 buildTranscriptModel 的入参引用跨帧稳定（内容同值折叠的前置）。 */
const liveToolsMemo = new WeakMap<readonly StreamingToolCall[], LiveTools | undefined>();

function liveToolsOf(driveSession: DriveSession): LiveTools | undefined {
  const calls = driveSession.streamingToolCalls;
  if (!calls) return undefined;
  const memoed = liveToolsMemo.get(calls);
  if (memoed !== undefined || liveToolsMemo.has(calls)) return memoed;
  let tools: LiveTools | undefined;
  for (const call of calls) {
    if (call.outputTail === undefined) continue;
    tools ??= {};
    tools[call.id] = {
      outputTail: call.outputTail,
      ...(call.totalLen !== undefined ? { totalLen: call.totalLen } : {}),
    };
  }
  liveToolsMemo.set(calls, tools);
  return tools;
}

/** 活动分支叶子的引用级记忆化（C6）：merged 在纯 delta 帧间引用稳定，叶子扫描
 *  O(n) 的 Set 构建只在权威条目到达（merged 换新数组）时重跑一次 */
const leafMemo = new WeakMap<readonly SessionEntry[], string | null>();

function leafOf(entries: readonly SessionEntry[]): string | null {
  if (leafMemo.has(entries)) return leafMemo.get(entries)!;
  const leaf = activeLeafId(entries);
  leafMemo.set(entries, leaf);
  return leaf;
}

/** 待回显条目的引用级记忆化（C6）：pendingPromptEntries 原样每帧新建（含时间戳），
 *  按（文本 × 挂靠点）折叠后，纯 delta 帧的数组前缀引用稳定，增量派生的前缀判据
 *  才能命中。时间戳冻结在首次挂出时刻——待回显气泡的发送时刻本就该定格。 */
let pendingMemo: { text: string; parentId: string | null; entries: SessionEntry[] } | undefined;

function pendingEntriesOf(text: string | undefined, parentId: string | null): SessionEntry[] {
  if (pendingMemo && pendingMemo.text === text && pendingMemo.parentId === parentId) return pendingMemo.entries;
  const entries = pendingPromptEntries(text, parentId);
  pendingMemo = { ...(text !== undefined ? { text } : { text: "" }), parentId, entries };
  return entries;
}

/** 基线 × 驱动条目 × 瞬态叠加 → 视图。
 * 瞬态条目（待回显 → 流式草稿）按送达顺序接到活动分支尾——parentId 必须挂到叶子
 * （activeLeafId），挂空会被叶子扫描当成新根，流式期间整条真实分支反被判成「被弃」
 * （实测：transcript 塌缩成只剩草稿一条）。权威条目落盘后叠加自动退场。 */
function composeDrivenView(driveSession: DriveSession, baseline: SessionSnapshot): TranscriptModel {
  const merged = mergeEntries(baseline.entries, driveSession.entries);
  const leafId = leafOf(merged);
  const pending = pendingEntriesOf(driveSession.pendingPrompt, leafId);
  const draft = streamingEntries(
    driveSession.streaming,
    driveSession.streamingToolCalls,
    pending.at(-1)?.id ?? leafId,
  );
  // 思考定稿信号（ADR-0012 补记九）：只指向合成草稿条目，完成思考在运行视图里即收起
  const draftThinking: DraftThinking | undefined = driveSession.streaming?.thinkingComplete
    ? { entryId: STREAMING_ENTRY_ID, thinkingComplete: true }
    : undefined;
  return buildTranscriptModel([...merged, ...pending, ...draft], liveToolsOf(driveSession), draftThinking);
}

/** 有基线且有驱动会话时才产出；否则返回 undefined（调用方回落到 REST/Live Tail 视图） */
export function resolveDrivenView(
  driveSession: DriveSession | undefined,
  baseline: SessionSnapshot | null,
): TranscriptModel | undefined {
  if (driveSession === lastDriveSession && baseline === lastBaseline) return lastView;
  lastDriveSession = driveSession;
  lastBaseline = baseline;
  lastView = driveSession && baseline ? composeDrivenView(driveSession, baseline) : undefined;
  return lastView;
}

/** 驱动视图的合成（ADR-0012 补记）：基线（REST 全量 / create 回包快照）× 驱动条目，
    按 id 幂等归并后经同一 buildTranscriptModel 出口。

    记忆化放在这里而不是 hook 里的 useMemo——这是刻意的：
    「memo 依赖必须带基线」这条曾以 ref 形式回归过一次（基线不响应 → 视图永久 undefined）。
    依赖数组是可以写错的，函数内部按参数身份缓存则写不错：
    任何一参数引用变了就重算，调用侧根本没有依赖数组可漏。 */
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { DriveSession } from "./drive-client";
import { mergeEntries, pendingPromptEntries, streamingEntries } from "./drive-client";
import { activeLeafId, buildTranscriptModel, type TranscriptModel } from "./transcript-model";

/** baseline 为 null 时给缓存槽的占位：undefined 已被「尚未计算」占用 */
const NO_BASELINE = Symbol("no-baseline");

/** 单槽缓存：同时挂载多个 session 时只影响命中率，不影响正确性 */
let lastDriveSession: DriveSession | undefined;
let lastBaseline: SessionSnapshot | null | typeof NO_BASELINE = NO_BASELINE;
let lastView: TranscriptModel | undefined;

/** 基线 × 驱动条目 × 瞬态叠加 → 视图。
 * 瞬态条目（待回显 → 流式草稿）按送达顺序接到活动分支尾——parentId 必须挂到叶子
 * （activeLeafId），挂空会被叶子扫描当成新根，流式期间整条真实分支反被判成「被弃」
 * （实测：transcript 塌缩成只剩草稿一条）。权威条目落盘后叠加自动退场。 */
function composeDrivenView(driveSession: DriveSession, baseline: SessionSnapshot): TranscriptModel {
  const merged = mergeEntries(baseline.entries, driveSession.entries);
  const leafId = activeLeafId(merged);
  const pending = pendingPromptEntries(driveSession.pendingPrompt, leafId);
  const draft = streamingEntries(
    driveSession.streaming,
    driveSession.streamingToolCall,
    pending.at(-1)?.id ?? leafId,
  );
  return buildTranscriptModel([...merged, ...pending, ...draft]);
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

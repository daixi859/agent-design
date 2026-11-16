/** 驱动视图的合成（ADR-0012 补记）：基线（REST 全量 / create 回包快照）× 驱动条目，
    按 id 幂等归并后经同一 buildTranscriptModel 出口。

    记忆化放在这里而不是 hook 里的 useMemo——这是刻意的：
    「memo 依赖必须带基线」这条曾以 ref 形式回归过一次（基线不响应 → 视图永久 undefined）。
    依赖数组是可以写错的，函数内部按参数身份缓存则写不错：
    任何一参数引用变了就重算，调用侧根本没有依赖数组可漏。 */
import type { SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { DriveSession } from "./drive-client";
import { mergeEntries } from "./drive-client";
import { buildTranscriptModel, type TranscriptModel } from "./transcript-model";

/** 单槽缓存：同时挂载多个 session 时只影响命中率，不影响正确性 */
let lastDriveSession: DriveSession | undefined;
let lastBaseline: SessionSnapshot | null = null;
let lastView: TranscriptModel | undefined;

/** 有基线且有驱动会话时才产出；否则返回 undefined（调用方回落到 REST/Live Tail 视图） */
export function resolveDrivenView(
  driveSession: DriveSession | undefined,
  baseline: SessionSnapshot | null,
): TranscriptModel | undefined {
  if (driveSession === lastDriveSession && baseline === lastBaseline) return lastView;
  lastDriveSession = driveSession;
  lastBaseline = baseline;
  lastView =
    driveSession && baseline
      ? buildTranscriptModel([...mergeEntries(baseline.entries, driveSession.entries)])
      : undefined;
  return lastView;
}

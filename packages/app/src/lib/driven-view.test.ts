/** resolveDrivenView 契约：基线 × 驱动条目的合成必须随**两者**变化而重算。
    这组用例是 ADR-0012 补记第 3 条的机器判据——
    上一次回归正是「基线在 ref 里不可响应，attached 先到、REST 404 后到，视图永久 undefined」。 */
import { describe, expect, it } from "vitest";
import type { SessionEntry, SessionSnapshot } from "@pi-studio/shared/pi-types";
import type { DriveSession } from "./drive-client";
import { resolveDrivenView } from "./driven-view";

const entry = (id: string, text: string): SessionEntry => ({
  type: "message",
  id,
  parentId: null,
  timestamp: "T0",
  message: { role: "user", content: text },
});

const snap = (entries: SessionEntry[], cwd = "/p"): SessionSnapshot => ({
  header: { type: "session", version: 3, id: "s1", parentId: null, timestamp: "T0", cwd },
  entries,
});

const driven = (entries: SessionEntry[]): DriveSession => ({ sessionId: "s1", status: "idle", entries });

describe("resolveDrivenView", () => {
  it("无驱动会话或无基线时都不产出（调用方回落 REST/Live Tail 视图）", () => {
    expect(resolveDrivenView(undefined, snap([]))).toBeUndefined();
    expect(resolveDrivenView(driven([]), null)).toBeUndefined();
  });

  it("两边都就绪时合成出视图", () => {
    const view = resolveDrivenView(driven([]), snap([entry("m1", "你好")]));
    expect(view).toBeDefined();
    expect(view!.turns).toHaveLength(1);
  });

  // 回归点：基线后到（create 会话先拿到 attached 快照、REST 稍后才失败/成功）
  it("基线后到必须重新产出视图（否则被缓存为 undefined，Composer 永久禁用）", () => {
    const session = driven([entry("m1", "你好")]);
    expect(resolveDrivenView(session, null)).toBeUndefined();

    // 同一 driveSession 引用、新基线 → 必须产出
    const late = resolveDrivenView(session, snap([entry("m1", "你好")]));
    expect(late).toBeDefined();
    expect(late!.turns).toHaveLength(1);
  });

  it("双源按 id 幂等归并：重叠条目只算一次", () => {
    const view = resolveDrivenView(driven([entry("m1", "你好")]), snap([entry("m1", "你好")]));
    expect(view!.turns).toHaveLength(1);
  });

  // 红证据（实测）：回车后 4 秒内 44 个 delta 帧到达，DOM 文本长度一动不动。
  it("权威条目到达前，流式增量已进入视图（不再白屏等整轮结束）", () => {
    const session: DriveSession = { ...driven([]), status: "running", streaming: { text: "正在生成" } };
    const view = resolveDrivenView(session, snap([entry("m1", "问：")]));
    expect(view).toBeDefined();
    expect(JSON.stringify(view)).toContain("正在生成");
  });

  it("权威条目到达后瞬态叠加消失：同一句只出现一次（不重复渲染）", () => {
    const partial: DriveSession = { ...driven([]), status: "running", streaming: { text: "回答" } };
    const before = JSON.stringify(resolveDrivenView(partial, snap([entry("m1", "问：")])));
    expect(before.split("回答")).toHaveLength(2); // 仅瞬态叠加一份

    // 条目落盘、streaming 已清 → 只剩权威条目那份
    const after = JSON.stringify(
      resolveDrivenView(driven([]), snap([entry("m1", "问："), entry("m2", "回答")])),
    );
    expect(after.split("回答")).toHaveLength(2);
  });

  it("驱动增量追加在基线之后（先见顺序）", () => {
    const view = resolveDrivenView(driven([entry("m2", "第二句")]), snap([entry("m1", "第一句")]));
    expect(view!.turns).toHaveLength(1);
    const text = JSON.stringify(view);
    expect(text.indexOf("第一句")).toBeLessThan(text.indexOf("第二句"));
  });
});

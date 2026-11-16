/** diff 解析的黄金样本：取自本机真实 pi 会话（`details.diff` 逐字节复制） */
import { describe, expect, it } from "vitest";
import { parseEditDiff, parseToolDiff, parseUnifiedPatch } from "./edit-diff";

/** 真实样本 1：宽度 2（本机 GLOSSARY.md 编辑，firstChangedLine = 36） */
const REAL_DIFF = [
  "    ...",
  " 32 独立整页双栏设置壳：自有侧栏导航（Preview、Appearance、About）与内容区，进入时替换主壳（ADR-0009）。",
  " 33 _Avoid_: 设置面板、设置弹层",
  "-36 对最近活跃 Session 的轮询追踪，只读地呈现其进行中的流式更新。",
  "+36 对最近活跃 Session 的轮询追踪，只读地呈现其进行中的流式更新；被驱动（Drive）的 Session 由驱动事件流供给增量，不经 Live Tail。",
  " 37 _Avoid_: 实时模式、streaming 模式",
  " 39 **Entry**:",
].join("\n");

/** 真实样本 2：宽度 3（行号过百，验证必须整段量宽） */
const WIDE_DIFF = [
  "     ...",
  " 149         });",
  " 150       });",
  "-153       // 先硬断全",
  "+152       // 先硬断全",
  " 157       return ",
].join("\n");

describe("parseEditDiff", () => {
  it("宽度 2 的样本：前缀与行号都正确切出", () => {
    expect(parseEditDiff(REAL_DIFF)).toEqual([
      { kind: "gap" },
      { kind: "context", no: 32, text: "独立整页双栏设置壳：自有侧栏导航（Preview、Appearance、About）与内容区，进入时替换主壳（ADR-0009）。" },
      { kind: "context", no: 33, text: "_Avoid_: 设置面板、设置弹层" },
      { kind: "del", no: 36, text: "对最近活跃 Session 的轮询追踪，只读地呈现其进行中的流式更新。" },
      { kind: "add", no: 36, text: "对最近活跃 Session 的轮询追踪，只读地呈现其进行中的流式更新；被驱动（Drive）的 Session 由驱动事件流供给增量，不经 Live Tail。" },
      { kind: "context", no: 37, text: "_Avoid_: 实时模式、streaming 模式" },
      { kind: "context", no: 39, text: "**Entry**:" },
    ]);
  });

  it("宽度 3 的样本：行号列随内容变宽（不能按固定列切）", () => {
    const rows = parseEditDiff(WIDE_DIFF);
    expect(rows).toEqual([
      { kind: "gap" },
      { kind: "context", no: 149, text: "        });" },
      { kind: "context", no: 150, text: "      });" },
      { kind: "del", no: 153, text: "      // 先硬断全" },
      { kind: "add", no: 152, text: "      // 先硬断全" },
      { kind: "context", no: 157, text: "      return " },
    ]);
  });

  it("空输入与不可辨认输入都返回空数组", () => {
    expect(parseEditDiff("")).toEqual([]);
    expect(parseEditDiff("no numbers here\nnor here")).toEqual([]);
  });
});

describe("parseUnifiedPatch", () => {
  it("标准 unified diff 兜底：跳过文件级 chrome，行号按 hunk 推进", () => {
    const patch = [
      "--- a/x.md",
      "+++ b/x.md",
      "@@ -10,3 +10,4 @@",
      " keep",
      "-drop",
      "+add",
      "+extra",
    ].join("\n");
    expect(parseUnifiedPatch(patch)).toEqual([
      { kind: "context", no: 10, text: "keep" },
      // 上下文行让新旧两侧同时前进，故删除行显示的是 old 侧行号 11
      { kind: "del", no: 11, text: "drop" },
      { kind: "add", no: 11, text: "add" },
      { kind: "add", no: 12, text: "extra" },
    ]);
  });
});

describe("parseToolDiff", () => {
  it("优先用内核 diff；缺失时回落 patch", () => {
    expect(parseToolDiff(REAL_DIFF, "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new").length).toBe(7);
    expect(parseToolDiff(undefined, "@@ -1 +1 @@\n-old\n+new")).toEqual([
      { kind: "del", no: 1, text: "old" },
      { kind: "add", no: 1, text: "new" },
    ]);
  });
});

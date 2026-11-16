/**
 * pi 的 edit 工具 diff 解析（ADR-0013）。
 *
 * `toolResult.details.diff` 由内核 `generateEditDiff()` 产出，**不是** unified diff：
 *   [前缀][行号右对齐][一个空格][该行内容]
 * 前缀 = ` `（上下文）/ `+`（新增）/ `-`（删除）；折叠区间写作缩进后的 `...`。
 *
 * 行号宽度 = **本段 diff 内**所有 `空格+数字` 的最大长度（对 102 份真实 diff
 * 的 2213 行逐行验证，100% 成立；gap 行是宽度 + 2 个空格）。因此必须整段先量宽、
 * 再切行，不能按固定列宽切。
 *
 * `details.patch` 则是标准 unified diff，只在没有 `diff` 时兜底。
 */

/** 上下文/新增/删除行：带内核给的行号 */
export interface DiffLine {
  kind: "context" | "add" | "del";
  no: number;
  text: string;
}

/** 折叠区间的占位行（内核用缩进的 `...` 表示） */
export interface DiffGap {
  kind: "gap";
}

export type DiffRow = DiffLine | DiffGap;

/** 行首前缀 + 行号（右对齐，前导空格计宽） */
const NUMBERED = /^([ +\-])( *)(\d+)( )(.*)$/;

function isGapLine(line: string): boolean {
  return /^ *\.\.\.\s*$/.test(line);
}

/** 解析内核 `details.diff`；空串或无法辨认时返回空数组（调用方回落 patch） */
export function parseEditDiff(diff: string): DiffRow[] {
  if (!diff) return [];
  const lines = diff.split("\n");

  // 第一遍：量出行号列的最大宽度（前缀后、内容前）
  let width = 0;
  for (const line of lines) {
    const match = line.match(NUMBERED);
    if (match) width = Math.max(width, match[2].length + match[3].length);
  }
  if (width === 0) return [];

  // 第二遍：按已知宽度切行
  const rows: DiffRow[] = [];
  for (const line of lines) {
    if (isGapLine(line)) {
      rows.push({ kind: "gap" });
      continue;
    }
    const match = line.match(NUMBERED);
    if (!match || match[2].length + match[3].length !== width) continue;
    const [, prefix, , digits, , text] = match;
    rows.push({
      kind: prefix === "+" ? "add" : prefix === "-" ? "del" : "context",
      no: Number(digits),
      text,
    });
  }
  return rows;
}

/** 解析标准 unified diff（`details.patch`），仅在 `details.diff` 缺失时兜底 */
export function parseUnifiedPatch(patch: string): DiffRow[] {
  if (!patch) return [];
  const rows: DiffRow[] = [];
  let newNo = 0;
  let oldNo = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      continue;
    }
    if (/^(---|\+\+\+|diff |index |new file|deleted file|old mode|new mode|similarity)/.test(line)) {
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", no: newNo++, text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", no: oldNo++, text: line.slice(1) });
    } else if (line.startsWith(" ") || line === "") {
      rows.push({ kind: "context", no: newNo++, text: line.slice(1) });
      oldNo++;
    }
  }
  return rows;
}

/** 内核优先，patch 兜底 */
export function parseToolDiff(diff?: string, patch?: string): DiffRow[] {
  const fromDiff = parseEditDiff(diff ?? "");
  return fromDiff.length > 0 ? fromDiff : parseUnifiedPatch(patch ?? "");
}

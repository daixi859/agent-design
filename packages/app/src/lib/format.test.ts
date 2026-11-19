/** formatDuration 的计时口径：读秒固定一位小数、满一分钟进位分秒（迭代需求三则之二） */
import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("不足一秒报毫秒", () => {
    expect(formatDuration(0, "en")).toBe("0ms");
    expect(formatDuration(32, "en")).toBe("32ms");
    expect(formatDuration(999, "en")).toBe("999ms");
  });

  it("秒制固定一位小数：整秒也补 .0（20.0s）", () => {
    expect(formatDuration(1_000, "en")).toBe("1.0s");
    expect(formatDuration(20_000, "en")).toBe("20.0s");
    expect(formatDuration(12_500, "en")).toBe("12.5s");
    expect(formatDuration(59_400, "en")).toBe("59.4s");
  });

  it("满一分钟进位分秒，秒取整不进小数（1m14s）", () => {
    // 59.5s 四舍五入即进位：不闪现 60.0s 的中间态
    expect(formatDuration(59_500, "en")).toBe("1m0s");
    expect(formatDuration(60_000, "en")).toBe("1m0s");
    expect(formatDuration(74_000, "en")).toBe("1m14s");
    expect(formatDuration(136_300, "en")).toBe("2m16s");
    expect(formatDuration(3_600_000, "en")).toBe("60m0s");
  });
});

// ===== C4 收编：呈现格式化的唯一实现（clock / date / tokens，locale 全程可穿） =====

import { formatClock, formatClockAt, formatDateAt, formatTokens } from "./format";

describe("formatTokens", () => {
  it("en 紧凑记数：K / M 大写（Intl compact）", () => {
    expect(formatTokens(999, "en")).toBe("999");
    expect(formatTokens(1_200, "en")).toBe("1.2K");
    expect(formatTokens(3_400_000, "en")).toBe("3.4M");
  });

  it("locale 可穿：zh 万进制", () => {
    expect(formatTokens(12_000, "zh")).toBe("1.2万");
  });
});

describe("formatClockAt / formatDateAt（毫秒锚）", () => {
  // 2026-11-18 14:30 本地时区——时刻的 AM/PM 形态随时区摆动，断言 locale 可穿而非具体串
  const at = new Date(2026, 10, 18, 14, 30).getTime();

  it("locale 可穿：en 与 zh 的时刻串不同（原 formatClock 硬编码 en 的缺陷回归位）", () => {
    expect(formatClockAt(at, "en")).not.toBe(formatClockAt(at, "zh"));
    expect(formatClockAt(at, "en")).toMatch(/PM/i);
  });

  it("月/日两形态各自成形", () => {
    expect(formatDateAt(at, "en")).toBe("11/18");
    expect(formatDateAt(at, "zh")).toBe("11/18");
  });
});

describe("formatClock（ISO 壳）", () => {
  it("解析失败回 undefined，不显示 Invalid Date", () => {
    expect(formatClock("not-a-date", "en")).toBeUndefined();
  });

  it("合法 ISO 出 locale 化时刻", () => {
    const iso = new Date(2026, 10, 18, 9, 5).toISOString();
    expect(formatClock(iso, "en")).toMatch(/AM/i);
  });
});

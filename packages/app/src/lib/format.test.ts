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

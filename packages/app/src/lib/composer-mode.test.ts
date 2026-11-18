/** ComposerMode 五态状态机契约：attaching 显式入态、判据可测（C3） */
import { describe, expect, it } from "vitest";
import { composerCanInput, composerModeOf, placeholderStateOf } from "./composer-mode";
import type { DriveSession } from "./drive-client";

const input = (over: Partial<Parameters<typeof composerModeOf>[0]>) => ({
  driven: false,
  attaching: false,
  takeover: false,
  foreignDriven: false,
  ...over,
});

describe("composerModeOf", () => {
  it("attach 在途优先于 driven：driven 态名下不再藏 driven-or-attaching", () => {
    expect(composerModeOf(input({ driven: true, attaching: true }))).toBe("attaching");
  });

  it("driven / attaching / lazy / foreign / locked 全序", () => {
    expect(composerModeOf(input({ driven: true }))).toBe("driven");
    expect(composerModeOf(input({ attaching: true }))).toBe("attaching");
    expect(composerModeOf(input({ takeover: true }))).toBe("lazy");
    expect(composerModeOf(input({ foreignDriven: true }))).toBe("foreign");
    expect(composerModeOf(input({}))).toBe("locked");
  });

  it("他属驱动优先于可接管", () => {
    expect(composerModeOf(input({ foreignDriven: true, takeover: true }))).toBe("foreign");
  });
});

describe("composerCanInput", () => {
  it("driven / attaching / lazy 可输入；foreign / locked 不可", () => {
    expect(composerCanInput("driven")).toBe(true);
    expect(composerCanInput("attaching")).toBe(true);
    expect(composerCanInput("lazy")).toBe(true);
    expect(composerCanInput("foreign")).toBe(false);
    expect(composerCanInput("locked")).toBe(false);
  });
});

describe("placeholderStateOf", () => {
  const drive = (over: Partial<DriveSession>): DriveSession => ({
    sessionId: "s1",
    status: "idle",
    entries: [],
    ...over,
  });

  it("不可输入恒回 default（禁用占位由 mode 决定）", () => {
    expect(placeholderStateOf(drive({ compacting: true }), false, false)).toBe("default");
  });

  it("优先级 compacting > retrying > busy > chip > default", () => {
    const busyDrive = drive({ status: "running", compacting: true });
    expect(placeholderStateOf(busyDrive, true, true)).toBe("compacting");
    expect(
      placeholderStateOf(drive({ status: "retrying", retryAttempt: 2 }), true, true),
    ).toBe("retrying");
    expect(placeholderStateOf(drive({ status: "running" }), true, true)).toBe("busy");
    expect(placeholderStateOf(drive({ status: "idle" }), true, true)).toBe("chip");
    expect(placeholderStateOf(drive({ status: "idle" }), false, true)).toBe("default");
  });
});

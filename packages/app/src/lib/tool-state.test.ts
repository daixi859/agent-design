/** Tool State 语义表契约：四态各有标签与色档、色档与状态同词汇（GLOSSARY Tool State） */
import { describe, expect, it } from "vitest";
import { TOOL_STATE_VIEW } from "./tool-state";
import type { ToolState } from "./transcript-model";

describe("TOOL_STATE_VIEW", () => {
  it("四态齐全且标签键与色档一一对应", () => {
    const states: ToolState[] = ["running", "ok", "error", "stopped"];
    for (const state of states) {
      expect(TOOL_STATE_VIEW[state].tone).toBe(state);
      expect(typeof TOOL_STATE_VIEW[state].label).toBe("string");
    }
  });
});

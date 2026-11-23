// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

function DemoSelect() {
  return (
    <Select defaultValue="sky">
      <SelectTrigger aria-label="主题">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sky">Sky</SelectItem>
        <SelectItem value="neutral">Neutral</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("触发器渲染为 combobox 并显示当前值", () => {
    render(<DemoSelect />);
    const trigger = screen.getByRole("combobox", { name: "主题" });
    expect(trigger).toHaveAttribute("data-slot", "select-trigger");
    expect(trigger).toHaveTextContent("Sky");
    expect(trigger).toHaveAttribute("data-variant", "input");
  });

  it("关闭态不渲染面板，点击后展开选项", async () => {
    render(<DemoSelect />);
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("选项与 trigger 的当前值一致", async () => {
    render(<DemoSelect />);
    await userEvent.click(screen.getByRole("combobox"));
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Sky");
    expect(options[1]).toHaveTextContent("Neutral");
  });
});

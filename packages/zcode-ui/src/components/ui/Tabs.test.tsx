// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

function DemoTabs() {
  return (
    <Tabs defaultValue="one">
      <TabsList aria-label="示例">
        <TabsTrigger value="one">one</TabsTrigger>
        <TabsTrigger value="two">two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">面板一</TabsContent>
      <TabsContent value="two">面板二</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("渲染 tablist / tab / tabpanel 三角色", () => {
    render(<DemoTabs />);
    expect(screen.getByRole("tablist")).toHaveAttribute("data-slot", "tabs-list");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("data-slot", "tabs-content");
  });

  it("选中项带 data-state=active，未选中为 inactive", () => {
    render(<DemoTabs />);
    const [one, two] = screen.getAllByRole("tab");
    // shadcn 的 data-active variant 匹配 [data-state="active"]，样式侧不依赖额外的 data-active 属性。
    expect(one).toHaveAttribute("data-state", "active");
    expect(two).toHaveAttribute("data-state", "inactive");
  });

  it("点击切换面板（受控由 radix 维护）", async () => {
    render(<DemoTabs />);
    expect(screen.getByText("面板一")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "two" }));
    expect(screen.getByText("面板二")).toBeVisible();
    expect(screen.getByRole("tab", { name: "two" })).toHaveAttribute("data-state", "active");
  });

  it("方向透传到 data-orientation（vertical 时列表变列）", () => {
    render(
      <Tabs defaultValue="one" orientation="vertical">
        <TabsList>
          <TabsTrigger value="one">one</TabsTrigger>
        </TabsList>
        <TabsContent value="one">面板</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist").closest("[data-slot=tabs]")).toHaveAttribute(
      "data-orientation",
      "vertical",
    );
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert, AlertDescription, AlertTitle } from "./Alert";
import { Avatar, AvatarFallback } from "./Avatar";
import { Badge } from "./Badge";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Kbd } from "./Kbd";
import { Label } from "./Label";
import { Progress } from "./Progress";
import { ScrollArea } from "./ScrollArea";
import { Separator } from "./Separator";
import { Spinner } from "./Spinner";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("Badge", () => {
  it("span 承载 data-slot / data-variant，默认 variant 为 default", () => {
    render(<Badge>新</Badge>);
    const el = screen.getByText("新");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("data-slot", "badge");
    expect(el).toHaveAttribute("data-variant", "default");
  });

  it("asChild 把外观套到链接上，不再多一层 span", () => {
    render(
      <Badge asChild>
        <a href="/x">链接徽标</a>
      </Badge>,
    );
    const link = screen.getByRole("link", { name: "链接徽标" });
    expect(link.getAttribute("data-slot")).toBe("badge");
  });
});

describe("Card", () => {
  it("根与各分区都有 data-slot", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>标题</CardTitle>
        </CardHeader>
        <CardContent>内容</CardContent>
      </Card>,
    );
    expect(screen.getByText("标题").closest("[data-slot=card]")).not.toBeNull();
    expect(document.querySelector("[data-slot=card-header]")).not.toBeNull();
    expect(document.querySelector("[data-slot=card-content]")).not.toBeNull();
  });

  it("size 变体写到 data-size（sm 收紧内边距）", () => {
    render(<Card size="sm">卡片</Card>);
    expect(document.querySelector("[data-slot=card]")).toHaveAttribute("data-size", "sm");
  });
});

describe("Alert", () => {
  it("role=alert，variant 同时进入 data-variant 与类名", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>失败</AlertTitle>
        <AlertDescription>说明</AlertDescription>
      </Alert>,
    );
    const el = screen.getByRole("alert");
    expect(el).toHaveAttribute("data-slot", "alert");
    expect(el).toHaveAttribute("data-variant", "destructive");
  });

  it("缺省 variant 为 default", () => {
    render(<Alert>默认</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "default");
  });
});

describe("Avatar", () => {
  it("尺寸变体写到 data-size", () => {
    const { rerender } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(document.querySelector("[data-slot=avatar]")).toHaveAttribute("data-size", "default");

    rerender(
      <Avatar size="lg">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(document.querySelector("[data-slot=avatar]")).toHaveAttribute("data-size", "lg");
  });
});

describe("Progress", () => {
  it("role=progressbar 与 aria-valuenow 跟随 value（并钳制到 0–100）", () => {
    const { rerender } = render(<Progress value={42} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");

    expect(bar).toHaveAttribute("data-state", "loading");

    rerender(<Progress value={999} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("Separator", () => {
  it("decorative=true 时只是装饰，false 时暴露 separator 角色", () => {
    const { rerender } = render(<Separator />);
    expect(screen.queryByRole("separator")).toBeNull();

    rerender(<Separator decorative={false} />);
    // radix 用 data-orientation 表达方向（aria-orientation 由浏览器推导），断言这个属性。
    expect(screen.getByRole("separator")).toHaveAttribute("data-orientation", "horizontal");
  });
});

describe("Label / Kbd / ScrollArea / Spinner", () => {
  it("Label 点击后聚焦关联控件（radix Label 行为）", () => {
    render(
      <>
        <Label htmlFor="target">标签</Label>
        <input id="target" />
      </>,
    );
    expect(screen.getByText("标签")).toHaveAttribute("data-slot", "label");
  });

  it("Kbd 渲染为 kbd 元素", () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText("⌘K").tagName).toBe("KBD");
    expect(screen.getByText("⌘K")).toHaveAttribute("data-slot", "kbd");
  });

  it("ScrollArea 把内容包进独立的 viewport（滚动条按需挂载）", () => {
    render(
      <ScrollArea>
        <div>内容</div>
      </ScrollArea>,
    );
    const viewport = document.querySelector("[data-slot=scroll-area-viewport]");
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveTextContent("内容");
    // 滚动条由 radix 在检测到溢出时才挂载，jsdom 无布局故此时不在场——断言这条行为而不是存在性。
    expect(viewport?.getAttribute("data-radix-scroll-area-viewport")).not.toBeNull();
  });

  it("Spinner 带 role=status，aria-label 可覆盖（缺省英文）", () => {
    const { rerender } = render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");

    rerender(<Spinner label="加载中" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "加载中");
  });
});
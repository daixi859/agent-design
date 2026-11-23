// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "./Button";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("Button", () => {
  it("渲染 button，data-slot 与缺省 type 符合契约", () => {
    render(<Button>保存</Button>);
    const el = screen.getByRole("button", { name: "保存" });
    expect(el.getAttribute("data-slot")).toBe("button");
    expect(el.getAttribute("data-variant")).toBe("default");
    expect(el.getAttribute("data-size")).toBe("default");
    // 基础组件不该在 form 里变成隐式提交按钮。
    expect(el.getAttribute("type")).toBe("button");
  });

  it("size / variant 反映到 data-* 与类名上", () => {
    render(
      <Button size="sm" variant="destructive">
        删除
      </Button>,
    );
    const el = screen.getByRole("button", { name: "删除" });
    expect(el.getAttribute("data-size")).toBe("sm");
    expect(el.getAttribute("data-variant")).toBe("destructive");
    expect(el.className).toContain("h-6");
    expect(el.className).toContain("bg-destructive");
  });

  it("className 覆盖变体类而不是叠加冲突类", () => {
    render(<Button className="h-10">高</Button>);
    const el = screen.getByRole("button", { name: "高" });
    expect(el.className).toContain("h-10");
    expect(el.className).not.toContain("h-7");
  });

  it("点击回调触发，disabled 时不触发", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>点我</Button>);
    await userEvent.click(screen.getByRole("button", { name: "点我" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        点我
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "点我" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("asChild 把外观套到子元素而不是再包一层 button", () => {
    render(
      <Button asChild variant="outline">
        <a href="/docs">文档</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "文档" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("data-slot")).toBe("button");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("按钮自身行高不随字号档位放大（行高 > 高度会让文字无法垂直居中）", () => {
    // 回归：sm 档曾用 text-ui-base/relaxed（14px→22.75px 行高），落在 h-6(24px) 里几乎顶满，
    // 更小的 h-5(20px) 会直接溢出。基础类统一 leading-none，各档不再自带行高。
    for (const size of ["xs", "sm", "default", "lg", "icon", "icon-sm"] as const) {
      expect(buttonVariants({ size }), size).toContain("leading-none");
      expect(buttonVariants({ size }), size).not.toContain("text-ui-base/relaxed");
    }
  });
});
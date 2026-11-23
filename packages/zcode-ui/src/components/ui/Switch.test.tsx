// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./Checkbox";
import { Switch } from "./Switch";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("Switch", () => {
  it("role=switch，checked 反映到 aria-checked 与 data-state", () => {
    const { rerender } = render(<Switch checked={false} aria-label="开关" />);
    const el = screen.getByRole("switch", { name: "开关" });
    expect(el).toHaveAttribute("aria-checked", "false");
    expect(el).toHaveAttribute("data-state", "unchecked");

    rerender(<Switch checked aria-label="开关" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch")).toHaveAttribute("data-state", "checked");
  });

  it("点击触发 onCheckedChange 并传出反向值", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="开关" />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("尺寸变体写到 data-size，disabled 时不响应点击", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch size="sm" disabled onCheckedChange={onCheckedChange} aria-label="小开关" />);
    const el = screen.getByRole("switch");
    expect(el).toHaveAttribute("data-size", "sm");
    await userEvent.click(el);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe("Checkbox", () => {
  it("三态映射到 aria-checked / data-state", () => {
    const { rerender } = render(<Checkbox checked={false} aria-label="勾选" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

    rerender(<Checkbox checked aria-label="勾选" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "checked");

    rerender(<Checkbox checked="indeterminate" aria-label="勾选" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "indeterminate");
  });

  it("受控切换把布尔值交给回调", async () => {
    function Controlled() {
      const [checked, setChecked] = useState<boolean | "indeterminate">(false);
      return <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="受控" />;
    }
    render(<Controlled />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });
});

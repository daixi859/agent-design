// @vitest-environment jsdom
import { createRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "./Input";
import { Label } from "./Label";
import { Textarea } from "./Textarea";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("Input", () => {
  it("ref 直接挂到原生 input 上（ref-as-prop），无需 forwardRef", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="搜索" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.getAttribute("data-slot")).toBe("input");
  });

  it("size 变体与原生 size 属性互不干扰", () => {
    render(<Input size="lg" htmlSize={20} aria-label="宽输入" />);
    const el = screen.getByLabelText("宽输入");
    expect(el.getAttribute("size")).toBe("20");
    expect(el.getAttribute("data-size")).toBe("lg");
    expect(el.className).toContain("h-8");
  });

  it("受控输入随 onChange 更新值", async () => {
    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <Input
          aria-label="受控"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Controlled />);
    await userEvent.type(screen.getByLabelText("受控"), "abc");
    expect((screen.getByLabelText("受控") as HTMLInputElement).value).toBe("abc");
  });

  it("Label 的 htmlFor 关联到输入框", () => {
    render(
      <>
        <Label htmlFor="field">字段</Label>
        <Input id="field" />
      </>,
    );
    expect(screen.getByLabelText("字段").tagName).toBe("INPUT");
  });
});

describe("Textarea", () => {
  it("ref 直接挂到原生 textarea 上", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="多行" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(ref.current?.getAttribute("data-slot")).toBe("textarea");
  });
});
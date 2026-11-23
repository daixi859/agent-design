// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger } from "./AlertDialog";
import { Button } from "./Button";
import { ButtonGroup, ButtonGroupText } from "./ButtonGroup";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./InputGroup";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("AlertDialog", () => {
  it("点击触发器后打开；点遮罩不关闭（必须显式选择）", async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>删除</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>确认删除？</AlertDialogTitle>
          <AlertDialogCancel>取消</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alertdialog")).toHaveAttribute(
      "data-slot",
      "alert-dialog-content",
    );

    // radix 的 AlertDialog 在 onInteractOutside 里 preventDefault：点遮罩不会关闭
    // （Escape 仍由底层 Dialog 处理，需要强制显式选择时消费方在 onEscapeKeyDown 里拦）。
    fireEvent.pointerDown(document.querySelector("[data-slot=alert-dialog-overlay]")!, {
      button: 0,
      pointerType: "mouse",
    });
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
  });
});

describe("Popover", () => {
  it("点击触发器展开内容", async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <Button>详情</Button>
        </PopoverTrigger>
        <PopoverContent>面板内容</PopoverContent>
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(await screen.findByText("面板内容")).toBeInTheDocument();
  });
});

describe("Collapsible", () => {
  it("触发器切换内容显隐（受控语义由 radix 维护）", async () => {
    render(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button>展开</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>隐藏内容</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.queryByText("隐藏内容")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(await screen.findByText("隐藏内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开" })).toHaveAttribute(
      "data-state",
      "open",
    );
  });
});

describe("RadioGroup", () => {
  it("role=radiogroup，选中项 aria-checked 跟随 value", () => {
    render(
      <RadioGroup value="b" aria-label="选项">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radiogroup")).toHaveAttribute("data-slot", "radio-group");
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("aria-checked", "true");
  });

  it("点击切换选中项并回调新值", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup value="a" onValueChange={onValueChange} aria-label="选项">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });
});

describe("InputGroup", () => {
  it("输入框与 addon 都在同一外壳内，addon 带 data-align", () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label="搜索" />
        <InputGroupAddon align="inline-end">尾</InputGroupAddon>
      </InputGroup>,
    );
    expect(screen.getByLabelText("搜索").closest("[data-slot=input-group]")).not.toBeNull();
    expect(document.querySelector("[data-slot=input-group-addon]")).toHaveAttribute(
      "data-align",
      "inline-end",
    );
    expect(document.querySelector("[data-slot=input-group-text], [data-slot=input-group-addon]")).not.toBeNull();
  });

  it("点击 addon 把焦点交给输入框", async () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label="搜索" />
        <InputGroupAddon>放大镜</InputGroupAddon>
      </InputGroup>,
    );
    await userEvent.click(screen.getByText("放大镜"));
    expect(screen.getByLabelText("搜索")).toHaveFocus();
  });
});

describe("ButtonGroup", () => {
  it("文本段与按钮同组，带 data-slot", () => {
    render(
      <ButtonGroup>
        <Button>左</Button>
        <ButtonGroupText>中</ButtonGroupText>
        <Button>右</Button>
      </ButtonGroup>,
    );
    expect(screen.getByText("中")).toHaveAttribute("data-slot", "button-group-text");
    expect(screen.getByRole("group")).toHaveAttribute("data-slot", "button-group");
  });
});
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("Dialog", () => {
  it("关闭态不渲染内容，点击触发器后出现在 body 上（Portal）", async () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>打开</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>说明</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "打开" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    // Portal：内容挂在 body 下，而不是触发器旁边。
    expect(dialog.closest("body")).not.toBeNull();
  });

  it("标题与描述通过 aria-labelledby / aria-describedby 关联", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>说明</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("标题");
    expect(dialog).toHaveAccessibleDescription("说明");
  });

  it("Escape 关闭对话框（radix 的焦点管理生效）", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closeLabel 覆盖右上角关闭按钮的无障碍名（缺省英文）", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="关闭">
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(await screen.findByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-slot",
      "dialog-close",
    );
  });
});

describe("Tooltip", () => {
  it("悬停触发器后渲染提示内容", async () => {
    render(
      <Tooltip>
        <TooltipTrigger asChild>
          <Button>悬停</Button>
        </TooltipTrigger>
        <TooltipContent>提示文案</TooltipContent>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.hover(screen.getByRole("button", { name: "悬停" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("提示文案");
  });
});

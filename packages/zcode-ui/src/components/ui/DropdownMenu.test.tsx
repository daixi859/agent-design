// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { setupTestDom } from "../../lib/test-dom";

setupTestDom();

describe("DropdownMenu", () => {
  it("关闭态不渲染菜单，点击触发器后展开菜单项", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>菜单</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuItem>复制</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "菜单" }));

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content");
    expect(screen.getByRole("menuitem", { name: "复制" })).toBeInTheDocument();
  });

  it("选中菜单项后触发 onSelect 并收起菜单", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>菜单</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>复制</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await userEvent.click(screen.getByRole("button", { name: "菜单" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "复制" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

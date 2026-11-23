import * as React from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";

/** 下拉菜单：radix 负责键盘导航（方向键 / 首字母）、Portal 定位与子菜单开合。 */
function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

// 圆角规范迁移（ZCode）：菜单外壳统一 lg、内部选项 md；子菜单重新起算。
function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 2,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        // 宽度按内容撑开（radix 外层 min-width:max-content），只保留下限与可用宽度上限：
        // 图标按钮触发器只有 ~28px，绑触发器宽度会把较长的菜单项挤成折行。
        className={cn(
          "z-[60] flex max-h-(--radix-dropdown-menu-content-available-height) max-w-(--radix-dropdown-menu-content-available-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) flex-col gap-0.5 overflow-x-hidden overflow-y-auto rounded-lg border border-popover-border bg-menu p-1 text-foreground shadow-md duration-100 focus:shadow-md focus-visible:shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group
      data-slot="dropdown-menu-group"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
}

export type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
};

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-ui-base/relaxed text-foreground outline-hidden select-none data-[highlighted]:bg-menu-hover data-[highlighted]:text-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive data-[variant=destructive]:data-[highlighted]:text-destructive-foreground data-disabled:pointer-events-none data-disabled:text-foreground-subtlest data-disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-current data-[variant=destructive]:data-[highlighted]:*:[svg]:text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuCheckboxItemProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.CheckboxItem
> & { inset?: boolean };

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-ui-base text-foreground outline-hidden select-none data-[highlighted]:bg-menu-hover data-[highlighted]:text-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:text-foreground-subtlest data-disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-foreground-subtle" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
}

export type DropdownMenuRadioItemProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.RadioItem
> & { inset?: boolean };

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-ui-base text-foreground outline-hidden select-none data-[highlighted]:bg-menu-hover data-[highlighted]:text-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:text-foreground-subtlest data-disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-foreground-subtle" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-ui-base font-medium text-foreground-subtlest data-inset:pl-7.5",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-ui-xs tracking-widest text-foreground-subtlest group-data-[highlighted]/dropdown-menu-item:text-foreground-subtle",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

export type DropdownMenuSubTriggerProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.SubTrigger
> & { inset?: boolean; indicator?: React.ReactNode };

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  indicator,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "group/dropdown-menu-sub-trigger flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-ui-base text-foreground outline-hidden select-none data-[highlighted]:bg-menu-hover data-[highlighted]:text-foreground data-inset:pl-7.5 data-[state=open]:bg-menu-hover data-[state=open]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {indicator ?? (
        <ChevronRightIcon className="ml-auto size-4 text-foreground-subtle" />
      )}
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-[60] flex min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) flex-col gap-0.5 overflow-hidden rounded-lg border border-popover-border bg-menu p-1 text-foreground shadow-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};

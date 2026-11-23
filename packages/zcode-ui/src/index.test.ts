/**
 * 导出面契约：桶导出悄悄少一项，消费方要到运行时才发现（且常常是生产环境）。
 * 这里把「库对外承诺的名字」钉成快照——加组件要显式更新这份清单。
 */
import { describe, expect, it } from "vitest";

import * as rootEntry from "./index";
import * as patternsEntry from "./components/patterns";
import * as uiEntry from "./components/ui";

/** 通用原子件（components/ui）。 */
const UI_EXPORTS = [
  "Alert",
  "AlertAction",
  "AlertDescription",
  "AlertDialog",
  "AlertDialogAction",
  "AlertDialogCancel",
  "AlertDialogContent",
  "AlertDialogDescription",
  "AlertDialogFooter",
  "AlertDialogHeader",
  "AlertDialogOverlay",
  "AlertDialogPortal",
  "AlertDialogTitle",
  "AlertDialogTrigger",
  "AlertTitle",
  "Avatar",
  "AvatarBadge",
  "AvatarFallback",
  "AvatarGroup",
  "AvatarGroupCount",
  "AvatarImage",
  "Badge",
  "Button",
  "ButtonGroup",
  "ButtonGroupSeparator",
  "ButtonGroupText",
  "Card",
  "CardAction",
  "CardContent",
  "CardDescription",
  "CardFooter",
  "CardHeader",
  "CardTitle",
  "Checkbox",
  "Collapsible",
  "CollapsibleContent",
  "CollapsibleTrigger",
  "Dialog",
  "DialogClose",
  "DialogContent",
  "DialogDescription",
  "DialogFooter",
  "DialogHeader",
  "DialogOverlay",
  "DialogPortal",
  "DialogTitle",
  "DialogTrigger",
  "DropdownMenu",
  "DropdownMenuCheckboxItem",
  "DropdownMenuContent",
  "DropdownMenuGroup",
  "DropdownMenuItem",
  "DropdownMenuLabel",
  "DropdownMenuPortal",
  "DropdownMenuRadioGroup",
  "DropdownMenuRadioItem",
  "DropdownMenuSeparator",
  "DropdownMenuShortcut",
  "DropdownMenuSub",
  "DropdownMenuSubContent",
  "DropdownMenuSubTrigger",
  "DropdownMenuTrigger",
  "Input",
  "InputGroup",
  "InputGroupAddon",
  "InputGroupButton",
  "InputGroupInput",
  "InputGroupText",
  "InputGroupTextarea",
  "Kbd",
  "KbdGroup",
  "Label",
  "Popover",
  "PopoverAnchor",
  "PopoverContent",
  "PopoverDescription",
  "PopoverHeader",
  "PopoverTitle",
  "PopoverTrigger",
  "Progress",
  "RadioGroup",
  "RadioGroupItem",
  "ScrollArea",
  "ScrollBar",
  "Select",
  "SelectContent",
  "SelectGroup",
  "SelectItem",
  "SelectLabel",
  "SelectScrollDownButton",
  "SelectScrollUpButton",
  "SelectSeparator",
  "SelectTrigger",
  "SelectValue",
  "Separator",
  "Spinner",
  "Switch",
  "Tabs",
  "TabsContent",
  "TabsList",
  "TabsTrigger",
  "Textarea",
  "Tooltip",
  "TooltipContent",
  "TooltipProvider",
  "TooltipTrigger",
  "alertVariants",
  "badgeVariants",
  "buttonGroupVariants",
  "buttonVariants",
  "inputGroupAddonVariants",
  "inputGroupButtonVariants",
  "inputVariants",
  "selectTriggerVariants",
  "tabsListVariants",
];

/** 组合模式层（components/patterns）。 */
const PATTERN_EXPORTS = [
  "FlipMetricValue",
  "LightweightDiffPreview",
  "Toast",
  "flipMetricTransition",
  "getLightweightDiffLineParts",
  "toastVariants",
];

/** 根入口额外承诺的工具与主题协议。 */
const ROOT_ONLY_EXPORTS = [
  "ThemeProvider",
  "ThemeContext",
  "cn",
  "applyTheme",
  "DEFAULT_THEME",
  "isTheme",
  "readStoredTheme",
  "resolveTheme",
  "storeTheme",
  "THEME_STORAGE_KEY",
  "THEMES",
  "useTheme",
];

describe("导出面", () => {
  it("components/ui 导出全部通用原子件", () => {
    for (const name of UI_EXPORTS) {
      expect(uiEntry, `缺少导出 ${name}`).toHaveProperty(name);
    }
  });

  it("components/patterns 导出组合件", () => {
    for (const name of PATTERN_EXPORTS) {
      expect(patternsEntry, `缺少导出 ${name}`).toHaveProperty(name);
    }
  });

  it("根入口 = ui + patterns + 工具与主题协议", () => {
    for (const name of [...UI_EXPORTS, ...PATTERN_EXPORTS, ...ROOT_ONLY_EXPORTS]) {
      expect(rootEntry, `根入口缺少导出 ${name}`).toHaveProperty(name);
    }
  });

  // 只断言「包含」挡不住悄悄多出来的导出：这里反过来做一次全等比对，
  // 多导出或少导出都要显式更新清单。
  it("根入口运行时导出与清单完全一致（不多不少）", () => {
    const runtimeNames = Object.keys(rootEntry).sort();
    const expected = [...UI_EXPORTS, ...PATTERN_EXPORTS, ...ROOT_ONLY_EXPORTS].sort();
    expect(runtimeNames).toEqual(expected);
  });

  it("预览站不出现在库入口里", () => {
    expect(rootEntry).not.toHaveProperty("PreviewApp");
    expect(rootEntry).not.toHaveProperty("ComponentGallery");
  });

  it("type-only 导出不泄漏成运行时值", () => {
    for (const name of ["ButtonProps", "InputProps", "Theme", "ProgressSegment"]) {
      expect(rootEntry).not.toHaveProperty(name);
    }
  });
});
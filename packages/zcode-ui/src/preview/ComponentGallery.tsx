import { useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FlipMetricValue,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  Kbd,
  KbdGroup,
  Label,
  LightweightDiffPreview,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components";
import { GalleryPage, GallerySection } from "./GallerySection";

/** Button：variant × size 矩阵（对照 ZCode button.tsx）。 */
function ButtonGallery() {
  const variants = [
    "default",
    "outline",
    "secondary",
    "ghost",
    "destructive",
    "warning",
    "link",
  ] as const;
  const sizes = ["xs", "sm", "default", "lg"] as const;
  return (
    <GallerySection
      title="Button"
      description="7 variant × 4 尺寸 + icon 系列；disabled 态 50% 透明；asChild 把外观套到链接上。"
    >
      <div className="flex flex-col gap-3">
        {variants.map((variant) => (
          <div className="flex items-center gap-2" key={variant}>
            <span className="w-24 text-ui-xs text-foreground-subtlest">{variant}</span>
            {sizes.map((size) => (
              <Button key={size} variant={variant} size={size}>
                按钮
              </Button>
            ))}
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-24 text-ui-xs text-foreground-subtlest">icon</span>
          <Button variant="ghost" size="icon-sm" aria-label="icon-sm">
            ＋
          </Button>
          <Button variant="ghost" size="icon" aria-label="icon">
            ＋
          </Button>
          <Button variant="outline" size="icon-lg" aria-label="icon-lg">
            ＋
          </Button>
          <Button variant="default" size="sm">
            <span data-icon="inline-start">←</span>
            前缀图标
            <span data-icon="inline-end">→</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="#/components">asChild → a</a>
          </Button>
        </div>
      </div>
    </GallerySection>
  );
}

function BadgeGallery() {
  const variants = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const;
  return (
    <GallerySection title="Badge" description="胶囊徽标，rounded-full h-5；asChild 可套在链接上。">
      <div className="flex flex-wrap items-center gap-2">
        {variants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
        <Badge>
          <span>●</span> with icon
        </Badge>
        <Badge asChild variant="outline">
          <a href="#/components">asChild → a</a>
        </Badge>
      </div>
    </GallerySection>
  );
}

function CardGallery() {
  return (
    <GallerySection title="Card" description="rounded-xl 外壳；size=sm 收紧内边距与间距。">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>默认 Card</CardTitle>
            <CardDescription>CardDescription：text-foreground-subtle。</CardDescription>
            <CardAction>
              <Badge variant="secondary">Action</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-ui-sm text-foreground-subtle">
            gap-4 py-4 px-4；标题 text-ui-base font-medium。
          </CardContent>
          <CardFooter className="border-t text-ui-xs text-foreground-subtlest">
            <span>Footer（border-t 自动 pt-4）</span>
          </CardFooter>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>size=sm</CardTitle>
            <CardDescription>gap-3 py-3 px-3。</CardDescription>
          </CardHeader>
          <CardContent className="text-ui-sm text-foreground-subtle">小尺寸卡片。</CardContent>
        </Card>
      </div>
    </GallerySection>
  );
}

function FormGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchSm, setSwitchSm] = useState(false);
  const [checkA, setCheckA] = useState<boolean | "indeterminate">(true);
  const [checkB, setCheckB] = useState<boolean | "indeterminate">(false);
  const [radio, setRadio] = useState("b");

  return (
    <GallerySection
      title="Input / Textarea / Label / Switch / Checkbox / Radio"
      description="表单基础件；开关、复选、单选均为 radix 受控组件（键盘可操作）。"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input placeholder="default 输入框" className="w-56" />
          <Input placeholder="sm" size="sm" className="w-40" />
          <Input placeholder="lg" size="lg" className="w-40" />
          <Input placeholder="disabled" disabled className="w-40" />
          <Input placeholder="invalid" aria-invalid className="w-40" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="demo-label">Label 标签</Label>
            <Input id="demo-label" placeholder="配 Label" className="w-56" />
          </div>
          <Textarea placeholder="Textarea：field-sizing-content 自增高" className="w-72" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2">
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label="switch default" />
            <Switch size="sm" checked={switchSm} onCheckedChange={setSwitchSm} aria-label="switch sm" />
            <Switch disabled aria-label="switch disabled" />
          </span>
          <span className="flex items-center gap-2">
            <Checkbox checked={checkA} onCheckedChange={setCheckA} aria-label="checked" />
            <Checkbox checked={checkB} onCheckedChange={setCheckB} aria-label="unchecked" />
            <Checkbox
              checked="indeterminate"
              onCheckedChange={setCheckA}
              aria-label="indeterminate"
            />
            <Checkbox disabled aria-label="disabled" />
          </span>
          <RadioGroup value={radio} onValueChange={setRadio} className="flex flex-row gap-3">
            {["a", "b", "c"].map((value) => (
              <span className="flex items-center gap-1.5" key={value}>
                <RadioGroupItem value={value} id={`radio-${value}`} />
                <Label htmlFor={`radio-${value}`} className="font-normal">
                  {value}
                </Label>
              </span>
            ))}
          </RadioGroup>
        </div>
      </div>
    </GallerySection>
  );
}

function SelectionGallery() {
  return (
    <GallerySection
      title="Tabs / Select / DropdownMenu"
      description="三者都走 radix：键盘导航、焦点管理与浮层定位由原语负责，样式沿用 ZCode。"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Tabs defaultValue="one">
            <TabsList>
              <TabsTrigger value="one">one</TabsTrigger>
              <TabsTrigger value="two">two</TabsTrigger>
              <TabsTrigger value="three">three</TabsTrigger>
            </TabsList>
            <TabsContent className="pt-2 text-ui-sm text-foreground-subtle" value="one">
              TabsContent（default variant：胶囊高亮）
            </TabsContent>
            <TabsContent className="pt-2 text-ui-sm text-foreground-subtle" value="two">
              第二个面板
            </TabsContent>
            <TabsContent className="pt-2 text-ui-sm text-foreground-subtle" value="three">
              第三个面板
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="one">
            <TabsList variant="line">
              <TabsTrigger value="one">one</TabsTrigger>
              <TabsTrigger value="two">two</TabsTrigger>
              <TabsTrigger value="three">three</TabsTrigger>
            </TabsList>
            <TabsContent className="pt-2 text-ui-sm text-foreground-subtle" value="one">
              TabsContent（line variant：下划线）
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Select defaultValue="sky">
            <SelectTrigger className="w-44">
              <SelectValue placeholder="选择主题" />
            </SelectTrigger>
            <SelectContent>
              {/* radix 的 SelectLabel 必须在 SelectGroup 内，否则运行时报错。 */}
              <SelectGroup>
                <SelectLabel>主题族</SelectLabel>
                <SelectItem value="sky">Sky</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="disabled" disabled>
                  Disabled
                </SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectItem value="zai">Zai</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select defaultValue="one">
            <SelectTrigger variant="default" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one">One</SelectItem>
              <SelectItem value="two">Two</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                打开菜单
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              {/* radix 的 Label / CheckboxItem / RadioItem 必须在 Group 内。 */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>操作</DropdownMenuLabel>
                <DropdownMenuItem>
                  复制 <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem inset>缩进项</DropdownMenuItem>
                <DropdownMenuCheckboxItem checked>显示行号</DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuRadioGroup value="light">
                <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>更多</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>子项</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem variant="destructive">删除</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </GallerySection>
  );
}

function OverlayGallery() {
  return (
    <GallerySection
      title="Dialog / AlertDialog / Popover / Tooltip"
      description="全部走 radix：Portal、焦点陷阱、Escape、碰撞翻转由原语负责。点按钮看真实交互。"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              打开 Dialog
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>对话框标题</DialogTitle>
              <DialogDescription>
                rounded-2xl 外壳、bg-popover、p-4、gap-4；右上角关闭按钮走 ghost icon-sm。
              </DialogDescription>
            </DialogHeader>
            <div className="text-ui-sm text-foreground-subtle">内容区</div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  取消
                </Button>
              </DialogClose>
              <Button size="sm">确认</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              打开 AlertDialog
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认操作？</AlertDialogTitle>
              <AlertDialogDescription>
                bg-popover/98 + ring-border + shadow-2xl，p-5 gap-5。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive">删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              打开 Popover
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>Popover</PopoverTitle>
            <PopoverDescription>rounded-xl、bg-popover、p-2.5、gap-4。</PopoverDescription>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost">
              悬停看 Tooltip
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            提示文案 <Kbd>⌘K</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </GallerySection>
  );
}

function FeedbackGallery() {
  const [progress, setProgress] = useState(64);

  return (
    <GallerySection
      title="Alert / Progress / Spinner / Toast / Collapsible"
      description="反馈类组件；Progress 含分段（segments）形态，Collapsible 用 radix 的高度动画。"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Alert>
            <AlertTitle>默认 Alert</AlertTitle>
            <AlertDescription>border-card-border bg-card，grid 布局，图标占 row-span-2。</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <span>⚠</span>
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>border-warning/40 bg-warning/10 text-warning。</AlertDescription>
            <AlertAction>
              <Button variant="ghost" size="xs">
                处理
              </Button>
            </AlertAction>
          </Alert>
          <Alert variant="destructive">
            <span>✕</span>
            <AlertTitle>Destructive</AlertTitle>
            <AlertDescription>实底 destructive + 白字。</AlertDescription>
          </Alert>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Progress value={progress} className="flex-1" />
            <span className="text-ui-xs tabular-nums text-foreground-subtlest">{progress}%</span>
          </div>
          <div className="flex items-center gap-3">
            <Progress
              value={100}
              className="flex-1"
              segments={[
                { id: "a", percent: 0.4, className: "bg-usage-chart-1" },
                { id: "b", percent: 0.25, className: "bg-usage-chart-2" },
                { id: "c", percent: 0.15, className: "bg-usage-chart-3" },
              ]}
            />
            <span className="text-ui-xs text-foreground-subtlest">segments</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 12))}>
              −
            </Button>
            <Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 12))}>
              ＋
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Spinner />
          <span className="text-ui-sm text-foreground-subtle">Spinner（LoaderCircle animate-spin）</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Toast title="已保存" description="default：bg-toast 白底描边。" shortcut="⌘S" actionLabel="撤销" />
          <Toast variant="success" title="构建通过" description="success-surface 配方。" />
          <Toast variant="warning" title="空间将满" description="warning-surface 配方。" />
          <Toast variant="destructive" title="任务失败" description="destructive-surface 配色。" />
        </div>
        <Collapsible defaultOpen className="max-w-md">
          <CollapsibleTrigger asChild>
            <Button size="xs" variant="ghost">
              展开 / 收起
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-lg border border-border bg-surface p-3 text-ui-sm text-foreground-subtle">
            animate-collapsible-down / up（高度由 radix 写入的 --radix-collapsible-content-height 驱动）。
          </CollapsibleContent>
        </Collapsible>
      </div>
    </GallerySection>
  );
}

function PatternGallery() {
  return (
    <GallerySection
      title="Patterns（组合模式层）"
      description="带产品假设的复合件，从 @pi-studio/zcode-ui/patterns 单独导出。"
    >
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-border">
          <LightweightDiffPreview
            lines={[
              " import { cn } from './lib/cn'",
              "-const x = hardcode('#333')",
              "+const x = token('--text-foreground')",
              " ",
              "+export function Button() {",
              "+  return <button />",
              "+}",
              " export { Button }",
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-6 font-mono text-ui-lg">
          <FlipMetricValue value="12:34" />
          <FlipMetricValue value="1K 2.5M" />
          <FlipMetricValue value="00:00.00" />
        </div>
      </div>
    </GallerySection>
  );
}

function MiscGallery() {
  return (
    <GallerySection
      title="Avatar / Kbd / InputGroup / ButtonGroup / ScrollArea"
      description="其余基础件与组合；ScrollArea 的内边距加在内容层（外壳留 p 会把滚动条从边框推开）。"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar>
            <AvatarFallback>ZC</AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback>S</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarImage
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%230ea5e9'/%3E%3C/svg%3E"
              alt="avatar"
            />
            <AvatarBadge />
          </Avatar>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>B</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+5</AvatarGroupCount>
          </AvatarGroup>
          <span className="flex items-center gap-1.5 text-ui-sm text-foreground-subtle">
            保存 <Kbd>⌘</Kbd> <Kbd>S</Kbd>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <InputGroup className="max-w-md">
            <InputGroupInput placeholder="搜索文件…" />
            <InputGroupAddon>
              <InputGroupText>⌕</InputGroupText>
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              <InputGroupButton variant="ghost" size="icon-xs">
                ✕
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <ButtonGroup className="max-w-md">
            <Button variant="outline" size="sm">
              左
            </Button>
            <ButtonGroupText>中</ButtonGroupText>
            <Button variant="outline" size="sm">
              右
            </Button>
            <ButtonGroupSeparator />
            <Button variant="outline" size="sm">
              尾
            </Button>
          </ButtonGroup>
        </div>
        <ScrollArea className="h-24 max-w-md rounded-lg border border-border bg-surface">
          <div className="flex flex-col gap-2 p-3 text-ui-sm text-foreground-subtle">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>滚动区第 {i + 1} 行（原生滚动条：透明轨道 + 圆角 thumb）</span>
            ))}
          </div>
        </ScrollArea>
      </div>
    </GallerySection>
  );
}

function TypographyGallery() {
  return (
    <GallerySection
      title="排版刻度"
      description="text-ui-* 字号与前景层级（--ui-font-size 基线 14px）；下列各行按刻度依次缩小。"
    >
      <div className="flex flex-col gap-2">
        <span className="text-ui-xl">text-ui-xl（+4px）</span>
        <span className="text-ui-lg">text-ui-lg（+2px）</span>
        <span className="text-ui-base">text-ui-base（基线 14px）</span>
        <span className="text-ui-caption">text-ui-caption（−1px）</span>
        <span className="text-ui-sm">text-ui-sm（−2px）</span>
        <span className="text-ui-xs">text-ui-xs（−4px）</span>
        <span className="text-ui-2xs">text-ui-2xs（−5px，例外刻度）</span>
        <Separator className="my-1" />
        <div className="flex flex-col gap-1">
          <span className="text-foreground">text-foreground</span>
          <span className="text-foreground-subtle">text-foreground-subtle（70%）</span>
          <span className="text-foreground-subtlest">text-foreground-subtlest（40%）</span>
        </div>
      </div>
    </GallerySection>
  );
}

/** 预览站主体：单页滚动，按族分组展示全部基础组件。 */
export function ComponentGallery() {
  return (
    <GalleryPage title="基础组件">
      <ButtonGallery />
      <BadgeGallery />
      <CardGallery />
      <FormGallery />
      <SelectionGallery />
      <OverlayGallery />
      <FeedbackGallery />
      <MiscGallery />
      <PatternGallery />
      <TypographyGallery />
    </GalleryPage>
  );
}
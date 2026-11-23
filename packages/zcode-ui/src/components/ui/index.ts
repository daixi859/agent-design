/**
 * 基础组件桶导出（通用层，无产品语义）。
 * 文件名与导出组件同名（PascalCase），与仓库命名检查一致。
 */
export { Button, buttonVariants, type ButtonProps } from "./Button";
export { Input, inputVariants, type InputProps } from "./Input";
export { Textarea } from "./Textarea";
export { Label } from "./Label";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardSize,
} from "./Card";
export { Badge, badgeVariants, type BadgeProps } from "./Badge";
export { Alert, AlertAction, AlertDescription, AlertTitle, alertVariants } from "./Alert";
export { Switch, type SwitchSize } from "./Switch";
export { Checkbox, type CheckboxState } from "./Checkbox";
export { RadioGroup, RadioGroupItem } from "./RadioGroup";
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "./Tabs";
export { Separator } from "./Separator";
export { Progress, type ProgressProps, type ProgressSegment } from "./Progress";
export { Spinner } from "./Spinner";
export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./Avatar";
export { Kbd, KbdGroup } from "./Kbd";
export { ScrollArea, ScrollBar } from "./ScrollArea";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./AlertDialog";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
  type SelectItemProps,
} from "./Select";
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
  type DropdownMenuItemProps,
} from "./DropdownMenu";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./Popover";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible";
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
  inputGroupAddonVariants,
  inputGroupButtonVariants,
} from "./InputGroup";
export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from "./ButtonGroup";
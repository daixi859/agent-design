# zcode-ui · ZCode 基础组件库

复刻 [ZCode](https://github.com/anthropics/zcode)（`D:\workspace\github-trending\ZCode`）的 CSS 令牌体系与基础组件，既是**可被导出的组件库**，也自带一个预览站。

- React 19 + Tailwind v4 + [radix-ui](https://www.radix-ui.com/)（无障碍与浮层行为）
- `cva` 变体 + `cn` 合并类名 + `data-slot` / `data-*` 契约
- 四套主题（default light / dark / zai-light / zai-dark），`<html>` 类名协议切换

## 使用

```tsx
// 1. 引一次样式（自带 Tailwind v4 预检与层序，并把组件源码纳入类名扫描）
import "@pi-studio/zcode-ui/styles.css";

// 2a. 需要全部组件
import { Button, Dialog, DialogContent, DialogTitle, ThemeProvider } from "@pi-studio/zcode-ui";

// 2b. 只要通用原子件（不带 patterns 层的产品假设）
import { Button } from "@pi-studio/zcode-ui/ui";

export function App() {
  return (
    <ThemeProvider defaultTheme="zai-dark">
      <Button>保存</Button>
    </ThemeProvider>
  );
}
```

已经自带 Tailwind v4 的项目改引 `@pi-studio/zcode-ui/tokens.css`：它只带令牌与基础层，不带预检，也不会重复导入 Tailwind。

### 导出面

| 子路径 | 内容 |
| --- | --- |
| `@pi-studio/zcode-ui` | 组件（ui + patterns）、`cn`、主题协议（`ThemeProvider` / `useTheme` / `applyTheme` / `THEMES`） |
| `@pi-studio/zcode-ui/<组件名>` | 单个组件的子路径（`/button`、`/dialog`、`/dropdown-menu`…共 27 个），适合只要一两件、想少打包的场景 |
| `@pi-studio/zcode-ui/ui` | 只有通用原子件（Button / Input / Dialog / Select / Tabs / …） |
| `@pi-studio/zcode-ui/patterns` | 组合件（`FlipMetricValue` / `LightweightDiffPreview` / `Toast`） |
| `@pi-studio/zcode-ui/styles.css` | 完整样式入口（Tailwind 预检 + 令牌 + 基础层） |
| `@pi-studio/zcode-ui/tokens.css` | 仅令牌与基础层 |

公开名字由 `src/index.test.ts` 钉成清单：加组件要显式更新那份清单，桶导出才不会悄悄漂移。

### 主题

`ThemeProvider` 支持受控与非受控两种用法，负责把 `.dark` / `.theme-zai-*` 写到 `<html>` 上（协议与 ZCode 一致）：

```tsx
// 非受控：自动读 localStorage、自动持久化
<ThemeProvider defaultTheme="zai-dark">

// 受控：切换完全由上层驱动（persist 默认关闭）
<ThemeProvider theme={theme} onThemeChange={setTheme}>
```

## 开发

```bash
pnpm zcode-ui        # 从仓库根启动预览站（vite，端口 3143）
```

- `#/` 组件总览：按层分组的全部组件，交互均为真实 radix 行为（点开看 Dialog / Select / Tooltip）
- `#/tokens`：色彩（语义层 + 原色板）、字号刻度、圆角、阴影令牌一览
- 右上角切换 4 套主题（持久化到 localStorage）

组件规范（分层判据、签名、DOM 契约、样式与测试要求）见 [CONVENTIONS.md](./CONVENTIONS.md)。

## 与 ZCode 的偏差

1. **radix 原语回归**：ZCode 本来就是 radix + 样式类，本包一度省掉依赖改成纯 DOM 静态复刻（无焦点陷阱 / 无定位 / 无键盘导航），现已补回 `radix-ui`。样式层一行未改，行为由原语提供。
2. **动效库移除**：`FlipMetricValue` 在 ZCode 里依赖 `motion/react` 做逐字翻页；这里只保留固定槽宽版式，数字直接渲染。
3. **未收录**：依赖重型运行时的组件（CodeViewer→@pierre/diffs+shiki、DiffViewer、PdfViewer、PptxPreview、Carousel、Chart、Resizable）与深度耦合 ZCode 内部实现的组件（Command→cmdk、Kbd→ControlShortcutBadge/i18n）。
4. **裸边框兑底**：v4 preflight 让裸 `border` / `border-t` 类落 currentColor（前景 37%）；ZCode 页面里它们一律显式配 `border-border`。本包在 `@layer base` 对五个纯宽度类兑底 `var(--color-border)`（见 `base.css` 注释），带色类按层序正常赢过兒底。
5. **输入类边框显式指语义令牌**：`InputGroup` / `Textarea` 上游写的是 `border-input`（= `--color-input`，输入框**底色**），在浅色主题下等于白描边不可见。本包改用 `border-input-border`（与 `Input` / `Select` 一致）；`InputGroup` 内部控件在 focus-visible 时也不再铺 `bg-input-focused`，避免外框里冒出一块白色内矩形。
6. **Tabs 深色胶囊加对比**：上游 `dark:data-active:bg-input/30` 落在与 `bg-muted` 几乎同色的 `--color-input` 上，深色主题里选中胶囊不可辨。本包改 `dark:data-active:bg-selected`（白 10%），并把胶囊高度收紧到 `calc(100% - 4px)`，与外壳留出均匀内边距。
7. **文案不写死中文**：上游 `DialogFooter` 的关闭按钮取 i18n 的 `common.close`；本包不引 intl，改由 `closeLabel` 传入（缺省 `"Close"`），`Spinner` 的 `aria-label` 同理。

## 来源映射（ZCode → zcode-ui）

| ZCode 源 | 本包 | 说明 |
| --- | --- | --- |
| `packages/ui/src/styles.css` | `src/styles/zcode-theme.css` | 四套主题令牌，原样拷贝 |
| `packages/ui/src/styles.css` 全局层 | `src/styles/base.css` | 滚动条、focus reset、动效时长令牌 |
| `packages/ui/src/styles.css` `@theme` | `src/styles/theme-bridge.css` | Tailwind v4 `@theme` 桥（字号刻度、字体栈、动效） |
| `packages/ui/src/components/ui/*.tsx` | `src/components/ui/*.tsx` | 组件：radix 原语 + 同名样式类 |
| `components/lib/utils.ts` | `src/lib/cn.ts` | `cn`（clsx + tailwind-merge，注册 `text-ui-*` 字号组） |

## 检查

纳入仓库五道守门（typecheck / test / check:css / check:sync / check:naming）。本包测试用 vitest + jsdom + @testing-library/react，断言对外契约（`data-slot`、ARIA、受控回调、导出面）。
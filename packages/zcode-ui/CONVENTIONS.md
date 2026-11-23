# zcode-ui 组件规范

本包是 ZCode 设计体系的**基础组件库**：通用原子件在 `src/components/ui/`，带产品假设的组合件在 `src/components/patterns/`。以下规则对每个组件都成立，新增组件按此写，改既有组件不得破坏它们。

## 1. 分层

| 层 | 目录 | 判据 | 导出入口 |
| --- | --- | --- | --- |
| 通用原子件 | `src/components/ui/` | 无产品语义，换任何业务都能用 | `.` 与 `./ui` |
| 组合件 | `src/components/patterns/` | 带 ZCode 产品假设（数字翻页版式、轻量 diff、单条 Toast） | `.` 与 `./patterns` |
| 预览站 | `src/preview/` | 开发演示，**不是库接口** | 不导出 |

判据是「换一个业务还能不能直接用」。拿不准时按原子件写，等它长出产品假设再下沉到 `patterns/`。

## 2. 组件签名

1. **ref 走 React 19 的 ref-as-prop**，不用 `React.forwardRef`，也不写 `displayName`。ref 类型由 `React.ComponentProps<"input">` 这类原生签名自带。
2. **props 类型从原语推导**，不手写重复的字段：radix 组件用 `React.ComponentProps<typeof XPrimitive.Root>`，原生元素用 `React.ComponentProps<"button">`。
3. **变体一律 `cva`**，且把 `xxxVariants` 一起导出——消费方需要在不渲染组件时复用类名（`buttonVariants({ variant, size })`）。
4. **不写 `React.FC`**，用普通函数声明 + 参数类型标注：`React.FC` 会隐式塞 `children`，且对泛型与重载不友好。
5. **只用具名导出**，不写 default export。桶文件（`index.ts`）是唯一聚合点。
6. **`type` 前缀导出类型**（`verbatimModuleSyntax` 要求），类型不得从运行时值里泄漏。
7. 需要覆盖原生属性时先 `Omit`，例如 `Input` 的 size 变体与原生 `size` 撞名，原生那侧改名 `htmlSize`。

## 3. DOM 契约

1. **每个组件带 `data-slot`**，值是其 kebab-case 组件名（`data-slot="dropdown-menu-item"`）。这是样式与测试的共同锚点。
2. **变体写到 `data-*`**：`data-variant` / `data-size` / `data-orientation` / `data-inset`。样式优先用 data 属性选择器，class 只留给一次性的间距覆盖。
3. **状态交给原语**：radix 负责 `data-state`（`open` / `closed` / `checked` / `active` / `highlighted`），不要自己再摆一个 `data-open`。
4. **按钮类组件的 `type` 缺省 `"button"`**：基础组件不该因为落在 `<form>` 里就变成隐式提交按钮。

## 4. 交互与无障碍

1. **浮层类一律用 radix 原语**（Dialog / AlertDialog / Popover / Tooltip / Select / DropdownMenu / Tabs / Switch / Checkbox / RadioGroup / Collapsible / Progress / Separator / Avatar / Label / ScrollArea）。焦点陷阱、Escape、键盘导航、碰撞翻转由原语负责，本包只负责样式。
2. **`asChild` 用 radix `Slot.Root` 真实现**：`asChild` 时把外观套到唯一子元素上，不再多包一层 DOM。
3. **标题 / 描述必须用原语的 Title / Description**，它们才会写 `aria-labelledby` / `aria-describedby`。
4. **默认文案用英文并允许覆盖**：`Spinner` 的 `label`、`DialogContent` 的 `closeLabel`。库不带 i18n，也不把中文写死在组件里。

## 5. 样式

1. **类名一律走语义令牌**（`bg-card` / `text-foreground-subtle` / `border-input-border`），不写十六进制、不写 `rgb()`。
2. **输入类的边框用 `border-input-border`**，不是 `border-input`——后者是输入框**底色**，浅色主题下等于白描边。（这是与上游 ZCode 的刻意偏差，见 README。）
3. **`cn()` 合并类名**（clsx + tailwind-merge），保证消费方传的 `className` 覆盖变体而不是与之打架。
4. **浮层外壳走共享配方**（`components/ui/surfaces.ts` 的 `menuSurface` / `popoverSurface` / `overlayMotion` / `overlayScrim`）：四类浮层逐字相同的那段类名只写一次，各组件只补差异（宽度、层级、`origin-`）。这是 ADR-0020「共享配方单一来源」在 TSX 层的落地。
4. **滚动容器不把内边距加在外壳上**：外壳留 `p` 会把原生滚动条从边框推开，内边距加在内容层。
5. **`<html>` 的主题协议不变**：`.dark` 管明暗，`.theme-zai-*` 管主题族，由 `ThemeProvider` 统一写入。
6. **遮罩用 `bg-overlay`**（`--color-overlay`），不写 `bg-black/60`：直引色板会绕开令牌层，`check:css` 也抓不到。
7. **定高的控件（按钮 / 键帽 / 分组文本）基础类一律 `leading-none`**，各尺寸档不得再带 `/relaxed` 这类行高。文字在 `inline-flex` + `items-center` 里是**按行盒**居中的，行高一旦超过控件高度，行盒比控件还高，居中就失效——`text-ui-base/relaxed`（14px→22.75px）落在 `h-5`（20px）上会直接溢出 2.75px。这类溢出 `check:css` 与类型检查都看不见，只能靠 `Button.test.tsx` 的回归用例与本条约束兜底。

## 6. 测试

1. 测试**就近放置**（`Button.test.tsx` 与 `Button.tsx` 同目录），不设集中测试目录。
2. 断言**对外契约**：`data-slot`、`data-variant`、ARIA 角色与状态、受控回调参数、`asChild` 后不再多一层元素。**不断言具体类名字符串的完整值**（`className` 只允许断言某一档的关键类）。
3. 需要 DOM 的文件在顶部 `// @vitest-environment jsdom`，并调用 `setupTestDom()`（补 jsdom 缺的 `ResizeObserver` / 指针捕获 / `getBoundingClientRect`，注册 `cleanup`，并在 `afterEach` 还原被覆盖的原型方法——否则会污染同进程的其它测试文件）。
4. 导出面由 `src/index.test.ts` 钉成清单，并且做**全等比对**（不多不少）：新增或删除公开导出必须同步更新该清单，否则测试直接失败。

## 7. 守门

仓库五道检查（根目录执行）全部要绿：

```
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node scripts/check-css-tokens.mjs
node scripts/check-token-sync.mjs
node scripts/check-file-naming.mjs
```

命名：组件文件 PascalCase 且与导出组件同名，其余文件 kebab-case（`test-dom.ts`、`theme-context.ts`）。
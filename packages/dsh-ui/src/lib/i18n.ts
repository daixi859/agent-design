/** 轻量 i18n（ADR-0011 模式，自 app/src/lib/i18n.ts 移植）：双字典 + 窗口事件同步。
    当前语言承载在 <html lang>（index.html 内联脚本首帧前确定，防闪白）；
    默认跟随 navigator.language（zh* → 中文），手动选择持久化到 localStorage。 */
export type Locale = "en" | "zh";

const LOCALE_KEY = "dsh-ui-locale";
const LOCALE_EVENT = "dsh-ui-locale-change";

/** 英文为源语言：新增文案先写这里，zh 侧同步补齐 */
const en = {
  // dsh-ui 壳
  tokensTab: "Tokens",
  componentsTab: "Components",
  dshComponents: "DSH Components",
  toggleTheme: "Toggle theme",
  language: "Language",
  copy: "Copy",

  // DSH 令牌预览
  dshStaticPalette: "DSH static palette",
  dshStaticNote: "Static color scales --dsh-static-* from deepseek-harness design-platform.css, grouped by family (82 tokens, light baseline)",
  dshAlias: "DSH semantic aliases",
  dshAliasNote: "Semantic aliases --dsh-alias-* (plus --dsh-menu-surface-fill); dark theme rebinds 115 of them",
  dshTypeRamp: "DSH type ramp",
  dshTypeNote: "UI scale --dsh-font-<size> and markdown scale --dsh-font-markdown-* (base 14px, code 11px)",
  dshRadius: "DSH radii",
  dshRadiusNote: "Radius scale --dsh-radius-* (4–28px, superellipse(1.5) upstream)",
  dshElevation: "DSH shadows & elevation",
  dshElevationNote: "Shadows --dsh-shadow-lv1..3 and elevation trio --dsh-elevation-panel/prominent/soft (0.5px hairline stroke in box-shadow)",
  dshMenuMaterial: "DSH menu material",
  dshMenuNote: "Menu surface --dsh-menu-surface-fill with backdrop blur(40px) saturate(150%)",
  dshMenuSampleItem1: "Menu item",
  dshMenuSampleItem2: "Another item",
  dshMenuSampleItem3: "Disabled item",

  // DSH 组件预览
  dshComponentsNote: "Static styling preview of deepseek-harness base components: markup and styles ported from @deepseek-ai/dsh-client-ui-primitives, every value reads the --dsh- token snapshot in styles/tokens.dsh.css. No interaction logic — controls render their resting or forced state.",
  dshAtoms: "Controls & atoms",
  dshAtomsNote: "Button (4 variants × 2 sizes) · Switch · Checkbox · SegmentedControl · SegmentedTabs · Pill · Tag (8 tones) · Input · ShortcutKeys · PathLabel · StateDot",
  dshOverlays: "Overlays & containers",
  dshOverlaysNote: "Tooltip · HoverCard · Menu (data rows, groups, separators, shortcuts, compact list) · MenuSurface material · Modal · Toast · DisclosureRow",
  dshOutputs: "Agent output cards",
  dshOutputsNote: "TerminalBlock · ReadBlock · DiffBlock · SearchBlock · WebBlock · CodeCard · UserMessageBubble — the shared code-surface geometry behind tool results",
  dshButtonContinue: "Continue",
  dshButtonRetry: "Retry",
  dshButtonDisabled: "Disabled",
  dshSwitchOn: "Send on Enter",
  dshSwitchOff: "Auto-compact",
  dshSwitchLocked: "Locked",
  dshCheckboxOn: "Show file diffs inline",
  dshCheckboxOff: "Remember this choice",
  dshCheckboxLocked: "Locked",
  dshSegmentedLabel: "View mode",
  dshSegmentStandard: "Standard",
  dshSegmentTui: "TUI",
  dshSegmentAuto: "Auto",
  dshTabsLabel: "Settings section",
  dshTabGeneral: "General",
  dshTabModels: "Models",
  dshTabAdvanced: "Advanced",
  dshPillActive: "Selected",
  dshPillIdle: "Unselected",
  dshInputPlaceholder: "Search sessions…",
  dshMenuNew: "New session",
  dshMenuSettings: "Open settings",
  dshMenuGroup: "Recent",
  dshMenuRelease: "Release drive",
  dshMenuDisabled: "Rename",
  dshTooltipSample: "Toggle sidebar",
  dshHoverTitle: "drive-client.ts",
  dshHoverBody: "WebSocket transport for the drive protocol: attach, steer, follow-up.",
  dshModalTitle: "Release this session?",
  dshModalBody: "The kernel keeps running; this window stops receiving live frames.",
  dshModalConfirm: "Release",
  dshModalCancel: "Cancel",
  dshModalWarnTitle: "Discard the queued draft?",
  dshModalWarnBody: "A queued follow-up has unsent changes.",
  dshModalDiscard: "Discard",
  dshToastText: "Session released",
  dshToastUndo: "Undo",
  dshDisclosureTitle: "Tool activity",
  dshDisclosureBody: "3 tools · read, edit, bash — the header is the primitive, the body is caller-owned.",
  dshUserMessage: "Fix the login redirect loop in auth/session.ts, then run the tests.",
  dshTerminalCommand: "pnpm vitest run --reporter=dot",
  dshSearchQuery: "drive lease",
  dshWebAnswer: "One shared client lease keeps two windows from driving the same session.",
};

const zh: Record<keyof typeof en, string> = {
  // dsh-ui 壳
  tokensTab: "令牌",
  componentsTab: "组件",
  dshComponents: "DSH 组件",
  toggleTheme: "切换主题",
  language: "语言",
  copy: "复制",

  // DSH 令牌预览
  dshStaticPalette: "DSH 静态色板",
  dshStaticNote: "deepseek-harness design-platform.css 的静态色板 --dsh-static-*，按色族分组陈列（82 项，浅色基准）",
  dshAlias: "DSH 语义别名",
  dshAliasNote: "语义别名 --dsh-alias-*（另有 --dsh-menu-surface-fill）；深色主题重绑其中 115 项",
  dshTypeRamp: "DSH 字阶",
  dshTypeNote: "UI 刻度 --dsh-font-<size> 与 markdown 刻度 --dsh-font-markdown-*（正文 14px、代码 11px）",
  dshRadius: "DSH 圆角",
  dshRadiusNote: "圆角刻度 --dsh-radius-*（4–28px，上游配 superellipse(1.5)）",
  dshElevation: "DSH 阴影与 elevation",
  dshElevationNote: "阴影 --dsh-shadow-lv1..3 与 elevation 三件套 --dsh-elevation-panel/prominent/soft（box-shadow 首层 0.5px 发丝描边）",
  dshMenuMaterial: "DSH 菜单材质",
  dshMenuNote: "菜单面 --dsh-menu-surface-fill 配 backdrop blur(40px) saturate(150%)",
  dshMenuSampleItem1: "菜单项",
  dshMenuSampleItem2: "另一项",
  dshMenuSampleItem3: "禁用项",

  // DSH 组件预览
  dshComponentsNote: "deepseek-harness 基础组件的静态样式预览：结构与样式移植自 @deepseek-ai/dsh-client-ui-primitives，一切取值读 styles/tokens.dsh.css 的 --dsh- 令牌快照。不含交互逻辑——控件停在静息态或强制态。",
  dshAtoms: "基础控件",
  dshAtomsNote: "Button（4 变体 × 2 尺寸）· Switch · Checkbox · SegmentedControl · SegmentedTabs · Pill · Tag（8 色板）· Input · ShortcutKeys · PathLabel · StateDot",
  dshOverlays: "浮层与容器",
  dshOverlaysNote: "Tooltip · HoverCard · Menu（数据行、分组、分隔线、快捷键、紧凑列表）· MenuSurface 材质 · Modal · Toast · DisclosureRow",
  dshOutputs: "Agent 输出卡片",
  dshOutputsNote: "TerminalBlock · ReadBlock · DiffBlock · SearchBlock · WebBlock · CodeCard · UserMessageBubble——工具结果共用的代码面几何",
  dshButtonContinue: "继续",
  dshButtonRetry: "重试",
  dshButtonDisabled: "已禁用",
  dshSwitchOn: "回车发送",
  dshSwitchOff: "自动压缩",
  dshSwitchLocked: "已锁定",
  dshCheckboxOn: "内联显示文件差异",
  dshCheckboxOff: "记住此选择",
  dshCheckboxLocked: "已锁定",
  dshSegmentedLabel: "渲染模式",
  dshSegmentStandard: "标准",
  dshSegmentTui: "TUI",
  dshSegmentAuto: "自动",
  dshTabsLabel: "设置分区",
  dshTabGeneral: "通用",
  dshTabModels: "模型",
  dshTabAdvanced: "高级",
  dshPillActive: "已选中",
  dshPillIdle: "未选中",
  dshInputPlaceholder: "搜索会话…",
  dshMenuNew: "新建会话",
  dshMenuSettings: "打开设置",
  dshMenuGroup: "最近",
  dshMenuRelease: "解除驱动",
  dshMenuDisabled: "重命名",
  dshTooltipSample: "切换侧栏",
  dshHoverTitle: "drive-client.ts",
  dshHoverBody: "驱动协议的 WebSocket 传输层：接管、插话、排队。",
  dshModalTitle: "解除此会话？",
  dshModalBody: "内核继续运行；本窗口不再接收实时帧。",
  dshModalConfirm: "解除",
  dshModalCancel: "取消",
  dshModalWarnTitle: "丢弃排队的草稿？",
  dshModalWarnBody: "有一条排队的追问带有未发送的修改。",
  dshModalDiscard: "丢弃",
  dshToastText: "会话已解除",
  dshToastUndo: "撤销",
  dshDisclosureTitle: "工具活动",
  dshDisclosureBody: "3 个工具 · read、edit、bash——原语只管行头，正文由消费方填充。",
  dshUserMessage: "修一下 auth/session.ts 里登录重定向的死循环，然后跑测试。",
  dshTerminalCommand: "pnpm vitest run --reporter=dot",
  dshSearchQuery: "drive lease",
  dshWebAnswer: "单客户端租约让两个窗口不会同时驱动同一个会话。",
};

const messages: Record<Locale, Record<keyof typeof en, string>> = { en, zh };

export type MessageKey = keyof typeof en;

export function currentLocale(): Locale {
  return document.documentElement.lang.startsWith("zh") ? "zh" : "en";
}

export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  localStorage.setItem(LOCALE_KEY, locale);
  // 壳顶栏唯一入口，事件同步订阅者（与 theme 同款模式）
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

export { LOCALE_EVENT as LOCALE_CHANGE_EVENT };

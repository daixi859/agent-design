/** 轻量 i18n（ADR-0011）：双字典 + 窗口事件同步，与 theme.ts 同款模式。
    当前语言承载在 <html lang>（index.html 内联脚本首帧前确定，防闪白）；
    默认跟随 navigator.language（zh* → 中文），手动选择持久化到 localStorage。 */
export type Locale = "en" | "zh";

const LOCALE_KEY = "pi-studio-locale";
const LOCALE_EVENT = "pi-studio-locale-change";

/** 英文为源语言：新增文案先写这里，zh 侧同步补齐 */
const en = {
  // 通用
  settings: "Settings",
  // 侧栏
  search: "Search",
  newSession: "New session",
  newSessionHint: "New session (coming soon)",
  sessionsSuffix: "sessions · local",
  // Brand Float
  toggleSidebar: "Toggle sidebar",
  back: "Back",
  // Session Bar
  untitledSession: "Untitled session",
  branched: "branched",
  branchedTitle: "This session has abandoned branches",
  fullScreen: "Full screen",
  exitFullScreen: "Exit full screen",
  toggleTheme: "Toggle theme",
  // 首页与空态
  loadingSessions: "Loading sessions…",
  welcomeTitle: "Welcome to Pi Studio",
  welcomeHint: "Run pi in any project, then pick a session from the sidebar.",
  emptyNoPiTitle: "No pi sessions found",
  emptyNoPiBefore: "Expected",
  emptyNoPiAfter: "on this machine.",
  emptyNothingTitle: "Nothing here yet",
  emptyNothingBefore: "Run",
  emptyNothingAfter: "in a project to start a session.",
  loadingSession: "Loading session…",
  loadFailedTitle: "Couldn't load this session",
  // Transcript
  thinking: "Thinking",
  encryptedReasoning: "Encrypted reasoning",
  emptyBranchTitle: "Nothing on the active branch",
  emptyBranchHint: "This session has no renderable entries yet.",
  jumpLatest: "Jump to latest",
  earlierBranch: "Earlier branch summarized",
  sessionNamed: "Session named “{name}”",
  contextCompacted: "Context compacted",
  tokensBefore: "{n} tokens before",
  // Composer（驱动激活；未驱动时保持视觉态）
  messagePlaceholder: "Message pi…",
  steerPlaceholder: "Steer the running session…",
  attach: "Drive",
  attachHint: "Attach this session to enable input",
  detach: "Detach",
  drivenBadge: "driven",
  runningBadge: "running",
  retryingBadge: "retrying",
  abort: "Abort",
  createInProject: "New session in this project",
  model: "Model",
  thinkingLevel: "Thinking level",
  toolsUsed: "Tools used",
  toolsSuffix: "tools",
  sendHint: "Send (Enter · Shift+Enter for newline)",
  // 设置壳
  preview: "Preview",
  appearance: "Appearance",
  about: "About",
  // 外观分区
  theme: "Theme",
  light: "Light",
  dark: "Dark",
  themeHint: "Also switchable from the moon button in the session header.",
  language: "Language",
  // 关于分区
  aboutIntro:
    "Pi Studio is a client for pi kernel session data on this machine: browse sessions read-only, then attach one to drive it for real — prompts, steering, tool activity, all persisted by the kernel itself.",
  version: "Version",
  stack: "Stack",
  stackValue: "React + Vite · CSS Modules",
  data: "Data",
  dataValue: "Local session JSONL, read-only",
  // 组件清单页
  iconography: "Iconography",
  iconographyNote:
    "SF Symbols-style stroked icons (20×20 · 1.6 stroke · currentColor) — see ui/Icon.tsx",
  controlsBadge: "Controls & badge",
  controlsNote:
    "IconButton / SearchField (ui/controls.module.css) · branched badge (Session Bar) · segmented control (Appearance)",
  surfaces: "Surfaces & accents",
  surfacesNote: "Semantic surfaces and accents (ADR-0001: themes switch only at the semantic tier)",
  typeRamp: "Type ramp",
  typeRampNote: "Type scale --text-*, paired line heights --leading-*",
  transcriptSamples: "Transcript samples",
  transcriptNote: "Turn three-tier structure (ADR-0006) · annotation rows · Composer docked variant",
  diff: "Diff",
  diffNote: "Inline diff surface for edit/bash tool results (ADR-0007)",
} as const;

const zh: Record<keyof typeof en, string> = {
  settings: "设置",
  search: "搜索",
  newSession: "新建会话",
  newSessionHint: "新建会话（下一阶段接入）",
  sessionsSuffix: "个会话 · 本地",
  toggleSidebar: "收起/展开侧栏",
  back: "返回",
  untitledSession: "未命名会话",
  branched: "已分支",
  branchedTitle: "此会话存在已放弃的分支",
  fullScreen: "全屏",
  exitFullScreen: "退出全屏",
  toggleTheme: "切换主题",
  loadingSessions: "正在加载会话…",
  welcomeTitle: "欢迎来到 Pi Studio",
  welcomeHint: "在任意项目运行 pi，然后从侧栏选择一个会话。",
  emptyNoPiTitle: "未找到 pi 会话",
  emptyNoPiBefore: "本机应存在",
  emptyNoPiAfter: "。",
  emptyNothingTitle: "这里还什么都没有",
  emptyNothingBefore: "在项目中运行",
  emptyNothingAfter: "即可开始会话。",
  loadingSession: "正在加载会话…",
  loadFailedTitle: "会话加载失败",
  thinking: "思考",
  encryptedReasoning: "加密的推理过程",
  emptyBranchTitle: "活动分支上没有内容",
  emptyBranchHint: "此会话还没有可渲染的条目。",
  jumpLatest: "跳到最新",
  earlierBranch: "较早分支已折叠为摘要",
  sessionNamed: "会话命名为「{name}」",
  contextCompacted: "上下文已折叠",
  tokensBefore: "折叠前 {n} tokens",
  // Composer（驱动激活；未驱动时保持视觉态）
  messagePlaceholder: "输入消息…",
  steerPlaceholder: "向运行中的会话插话…",
  attach: "驱动",
  attachHint: "接管此会话后可输入",
  detach: "解除驱动",
  drivenBadge: "驱动中",
  runningBadge: "运行中",
  retryingBadge: "重试中",
  abort: "中止",
  createInProject: "在此项目新建会话",
  model: "模型",
  thinkingLevel: "思考等级",
  toolsUsed: "使用工具",
  toolsSuffix: "个工具",
  sendHint: "发送（Enter · Shift+Enter 换行）",
  preview: "预览",
  appearance: "外观",
  about: "关于",
  theme: "主题",
  light: "浅色",
  dark: "深色",
  themeHint: "也可通过会话标题栏的月亮按钮切换。",
  language: "语言",
  aboutIntro:
    "Pi Studio 是本机 pi 内核 session 数据的客户端：只读浏览全部会话，接管任一会话即可真刀真枪地驱动——发消息、插话、看工具执行，全部由内核落盘。",
  version: "版本",
  stack: "技术栈",
  stackValue: "React + Vite · CSS Modules",
  data: "数据",
  dataValue: "本地会话 JSONL，只读",
  iconography: "图标",
  iconographyNote: "SF Symbols 风格描边图标（20×20 · 1.6 描边 · currentColor），见 ui/Icon.tsx",
  controlsBadge: "控件与徽标",
  controlsNote: "IconButton / SearchField（ui/controls.module.css）· branched 徽标（Session Bar）· 分段控件（Appearance）",
  surfaces: "表面与强调色",
  surfacesNote: "语义层表面与强调色（ADR-0001：主题只在语义层切换）",
  typeRamp: "字阶",
  typeRampNote: "字号刻度 --text-*，行高配对 --leading-*",
  transcriptSamples: "对话样张",
  transcriptNote: "Turn 三层结构（ADR-0006）· 注解行 · Composer dock 变体",
  diff: "差异对比",
  diffNote: "edit/bash 工具结果的内嵌 diff 表面（ADR-0007）",
};

const messages: Record<Locale, Record<keyof typeof en, string>> = { en, zh };

export type MessageKey = keyof typeof en;

export function currentLocale(): Locale {
  return document.documentElement.lang.startsWith("zh") ? "zh" : "en";
}

export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  localStorage.setItem(LOCALE_KEY, locale);
  // 双入口（Appearance 正式入口）共享状态，用窗口事件同步订阅者
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

/** 极简插值：{name} 形占位符（sessionNamed / tokensBefore 两处） */
export function translateVars(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string>,
): string {
  return translate(locale, key).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export { LOCALE_EVENT as LOCALE_CHANGE_EVENT };

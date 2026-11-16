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
  extensionMessage: "extension · {customType}",
  // Composer（驱动激活；未驱动时保持视觉态）
  messagePlaceholder: "Message pi…",
  steerPlaceholder: "Steer the running session…",
  attach: "Drive",
  attachHint: "Attach this session to enable input",
  detach: "Detach",
  drivenBadge: "driven",
  runningBadge: "running",
  retryingBadge: "retrying",
  callingBadge: "calling {name}…",
  queuedBadge: "{n} queued",
  compactingBadge: "compacting context…",
  abort: "Abort",
  createInProject: "New session in this project",
  model: "Model",
  thinkingLevel: "Thinking level",
  toolsUsed: "Tools used",
  toolsSuffix: "tools",
  sendHint: "Send (Enter · Shift+Enter for newline)",
  followUp: "Follow up",
  followUpHint: "Queued after this run finishes",
  errSessionAlreadyDriven: "This session is already being driven",
  errSessionConflict: "Session conflict",
  errSessionNotDriven: "Session is not being driven",
  errBadFrame: "Malformed protocol frame",
  errUnknownFrame: "Unknown protocol frame",
  // 设置壳
  preview: "Preview",
  transcript: "Transcript",
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
  dataValue: "Local session JSONL · browse read-only, drive writable",
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
  // Transcript 过程组与工具行（ADR-0013）
  toolCount: "tool",
  toolCountPlural: "tools",
  thoughtCount: "thought",
  thoughtCountPlural: "thoughts",
  failedCount: "failed",
  failedCountPlural: "failed",
  draft: "draft",
  abandonedBranch: "{n} abandoned branch",
  abandonedBranchPlural: "{n} abandoned branches",
  inspectArgs: "Inspect args",
  // 代码块头部（DSH 同样把文案交给 owner 注入）
  copy: "Copy",
  copied: "Copied",
  copyDiff: "Copy diff",
  // 工具状态四态（pi 语义）
  aborted: "Aborted",
  attachedImage: "Attached image",
  errorOccurred: "An error occurred",
  stateRunning: "Running",
  stateOk: "Done",
  stateError: "Failed",
  stateStopped: "Stopped",
  // 样张标签（仅 Preview 的 Transcript Lab 使用）
  labWarnAborted: "Aborted",
  labWarnTestFailed: "An error occurred: 1 test failed",
  labTurnFull: "Turn · full tool chain",
  labTurnSubagent: "Turn · subagent, wide-number diff, failure",
  labTurnAborted: "Turn · aborted",
  labCodeBlock: "Code block · inside an assistant answer",
  transcriptStates: "Tool states · running / ok / error / stopped",
  labEmpty: "Empty state",
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
  extensionMessage: "扩展 · {customType}",
  // Composer（驱动激活；未驱动时保持视觉态）
  messagePlaceholder: "输入消息…",
  steerPlaceholder: "向运行中的会话插话…",
  attach: "驱动",
  attachHint: "接管此会话后可输入",
  detach: "解除驱动",
  drivenBadge: "驱动中",
  runningBadge: "运行中",
  retryingBadge: "重试中",
  callingBadge: "调用 {name}…",
  queuedBadge: "已排队 {n}",
  compactingBadge: "正在折叠上下文…",
  abort: "中止",
  createInProject: "在此项目新建会话",
  model: "模型",
  thinkingLevel: "思考等级",
  toolsUsed: "使用工具",
  toolsSuffix: "个工具",
  sendHint: "发送（Enter · Shift+Enter 换行）",
  followUp: "追问",
  followUpHint: "本轮运行结束后送达",
  errSessionAlreadyDriven: "该会话正在被驱动",
  errSessionConflict: "会话冲突",
  errSessionNotDriven: "会话未被驱动",
  errBadFrame: "协议帧格式错误",
  errUnknownFrame: "未知的协议帧",
  preview: "预览",
  transcript: "对话区",
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
  dataValue: "本地会话 JSONL · 浏览只读，驱动可写",
  iconography: "图标",
  iconographyNote: "SF Symbols 风格描边图标（20×20 · 1.6 描边 · currentColor），见 ui/Icon.tsx",
  controlsBadge: "控件与徽标",
  controlsNote: "IconButton / SearchField（ui/controls.module.css）· branched 徽标（Session Bar）· 分段控件（Appearance）",
  surfaces: "表面与强调色",
  surfacesNote: "语义层表面与强调色（ADR-0001：主题只在语义层切换）",
  typeRamp: "字阶",
  typeRampNote: "字号刻度 --text-*，行高配对 --leading-*",
  toolCount: "个工具",
  toolCountPlural: "个工具",
  thoughtCount: "次思考",
  thoughtCountPlural: "次思考",
  failedCount: "个失败",
  failedCountPlural: "个失败",
  draft: "草稿",
  abandonedBranch: "{n} 条被弃分支",
  abandonedBranchPlural: "{n} 条被弃分支",
  inspectArgs: "查看参数",
  copy: "复制",
  copied: "已复制",
  copyDiff: "复制 diff",
  aborted: "已中止",
  attachedImage: "附加图片",
  errorOccurred: "发生错误",
  stateRunning: "运行中",
  stateOk: "完成",
  stateError: "失败",
  stateStopped: "已取消",
  labWarnAborted: "已中止",
  labWarnTestFailed: "发生错误：1 条测试失败",
  labTurnFull: "Turn · 完整工具链",
  labTurnSubagent: "Turn · 子代理、宽行号 diff、失败态",
  labTurnAborted: "Turn · 中止态",
  labCodeBlock: "代码块 · 助手回答内",
  transcriptStates: "工具四态 · 运行中 / 完成 / 失败 / 已取消",
  labEmpty: "空态",
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

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Activity, ArrowUp, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy,
  FileCode2, Files, FolderGit2, GitBranch, LayoutGrid, ListChecks, MoreHorizontal,
  Paperclip, Plus, Search, Settings2, Share2, Sparkles, Square, Terminal, X,
} from "lucide-react";
import {
  Avatar, AvatarFallback, Badge, Button, Checkbox, Collapsible, CollapsibleContent,
  CollapsibleTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger, InputGroup, InputGroupAddon,
  InputGroupInput, Kbd, LightweightDiffPreview, Progress, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, Separator, Tabs, TabsContent, TabsList,
  TabsTrigger, Textarea, Tooltip, TooltipContent, TooltipTrigger,
} from "../components";
import { cn } from "../lib/cn";
import {
  activityItems, changedFiles, codeExcerpt, contextBreakdown, diffLines, liveLines,
  planSteps, queueSeed, searchHits, sessionGroups, testLines,
  type SessionMock, type SessionState,
} from "./agent-mock";
import "./agent-page.css";

type Signal = "user" | "reasoning" | "assistant" | "tool";

const signalColor: Record<Signal, string> = {
  user: "var(--color-trajectory-user)",
  reasoning: "var(--color-trajectory-reasoning)",
  assistant: "var(--color-trajectory-assistant)",
  tool: "var(--color-trajectory-tool-call)",
};

const stateDot: Record<SessionState, string> = {
  running: "agent-bg-running",
  done: "agent-bg-done",
  paused: "agent-bg-paused",
  failed: "agent-bg-failed",
};

/** 一次事件 = 脊柱上的一个节点；时间标签用等宽，强调这是一条时间线。 */
function TraceEntry({
  signal,
  time,
  children,
}: {
  signal: Signal;
  time: string;
  children: ReactNode;
}) {
  return (
    <div className="agent-entry">
      <div className="agent-gutter" aria-hidden="true">
        <span className="agent-tick" />
        <span className="agent-time">{time}</span>
        <span
          className="agent-node"
          style={{ "--node-color": signalColor[signal] } as CSSProperties}
        />
      </div>
      <div className="agent-entry-body">{children}</div>
    </div>
  );
}

/** 工具事件外壳：所有工具共用一条头部栏，状态色由轨迹令牌给出。 */
function ToolCard({
  name,
  detail,
  duration,
  live = false,
  children,
}: {
  name: string;
  detail: string;
  duration: string;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("agent-tool-surface rounded-lg", live && "agent-live-surface")}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {live ? (
          <span className="agent-live-dot size-1.5 shrink-0 rounded-full" />
        ) : (
          <Terminal className="size-3.5 shrink-0 text-foreground-subtlest" />
        )}
        <span className="font-mono text-ui-xs font-medium">{name}</span>
        <span className="truncate font-mono text-ui-xs text-foreground-subtle">
          {detail}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-ui-2xs text-foreground-subtlest">
          {live && <span className="agent-signal-tool">运行中</span>}
          {duration}
        </span>
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

/** 左侧图标轨道：只承担导航，不承载文案。 */
function AgentRail() {
  const items = [
    { icon: LayoutGrid, label: "运行轨迹", active: true },
    { icon: FolderGit2, label: "工作区", active: false },
    { icon: ListChecks, label: "任务", active: false },
    { icon: Files, label: "文件", active: false },
    { icon: Activity, label: "用量", active: false },
  ];
  return (
    <nav className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3 md:flex" aria-label="主导航">
      <div className="mb-5 flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        {items.map((item) => (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-lg text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground",
                  item.active && "bg-selected text-foreground"
                )}
              >
                {item.active && (
                  <span className="absolute -left-2 h-4 w-0.5 rounded-full bg-primary" />
                )}
                <item.icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="帮助">
              <CircleHelp className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">帮助</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="设置">
              <Settings2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">设置</TooltipContent>
        </Tooltip>
        <Avatar size="sm" className="mt-1">
          <AvatarFallback className="bg-secondary text-ui-2xs">MY</AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}

/** 会话列：搜索 / 分组 / 状态点；点击切换当前 run 的标题面包屑。 */
function SessionColumn({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (session: SessionMock) => void;
}) {
  const [filter, setFilter] = useState("");
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <InputGroup className="h-7">
          <InputGroupAddon>
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="搜索会话"
            aria-label="搜索会话"
            className="text-ui-xs"
          />
        </InputGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="新建运行">
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建运行</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessionGroups.map((group) => {
          const items = group.items.filter((item) =>
            item.title.toLowerCase().includes(filter.trim().toLowerCase())
          );
          if (items.length === 0) return null;
          return (
            <div className="mb-4" key={group.label}>
              <div className="px-2 pb-1.5 text-ui-2xs font-medium text-foreground-subtlest">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => onSelect(session)}
                    className={cn(
                      "group/session relative flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors",
                      activeId === session.id ? "bg-selected" : "hover:bg-hover"
                    )}
                  >
                    {activeId === session.id && (
                      <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" />
                    )}
                    <span className="flex w-full items-center gap-1.5">
                      <span className={cn("size-1.5 shrink-0 rounded-full", stateDot[session.state])} />
                      <span className={cn(
                        "ellipsis flex-1 text-ui-xs",
                        activeId === session.id ? "font-medium text-foreground" : "text-foreground/80"
                      )}>
                        {session.title}
                      </span>
                      {session.unread ? (
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-ui-2xs text-primary-foreground">
                          {session.unread}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex w-full items-center gap-1.5 pl-3">
                      <span className="ellipsis flex-1 font-mono text-ui-2xs text-foreground-subtlest">
                        {session.project}
                      </span>
                      {session.branch && <GitBranch className="size-2.5 text-foreground-subtlest" />}
                      <span className="font-mono text-ui-2xs text-foreground-subtlest">{session.when}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-border px-3 text-ui-2xs text-foreground-subtlest">
        <span className="size-1.5 rounded-full bg-success" />
        <span>本地服务已连接</span>
        <span className="ml-auto font-mono">6 runs</span>
      </div>
    </aside>
  );
}

/** 轨迹本体：用户发言 → 思考 → 工具 → 结论 → 当前运行中的命令。 */
function TracePanel({
  extraMessages,
  scrollRef,
}: {
  extraMessages: { time: string; text: string }[];
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  // 贴底是 agent 工作台的默认状态；切回本标签页或收到新消息时都跟到最新一条。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (extraMessages.length === 0) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [scrollRef, extraMessages.length]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[840px] px-8 pt-6 pb-10">
        <div className="mb-7 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background-alt px-3 py-2 text-ui-xs text-foreground-subtle">
          <GitBranch className="size-3.5 agent-signal-reasoning" />
          <span>从
            <span className="mx-1 font-mono text-foreground">run 06</span>分叉 · 保留原有测试基线
          </span>
          <span className="ml-auto font-mono text-ui-2xs">12:41 → 现在</span>
        </div>

        <div className="agent-trace">
          <TraceEntry signal="user" time="12:41">
            <div className="agent-user-surface rounded-lg px-4 py-3">
              <p className="max-w-[68ch] text-ui-base leading-relaxed">
                重试正在导致重复扣款。先梳理 webhook 的重试链路，再修幂等性 —— 不要动 ledger writer。
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="gap-1 font-mono text-ui-2xs">
                  <FileCode2 className="size-3" />handler.ts
                </Badge>
                <Badge variant="outline" className="gap-1 font-mono text-ui-2xs">
                  <FileCode2 className="size-3" />retry.spec.ts
                </Badge>
                <span className="ml-1 text-ui-2xs text-foreground-subtlest">2 个附件</span>
              </div>
            </div>
          </TraceEntry>

          <TraceEntry signal="reasoning" time="12:43">
            <Collapsible defaultOpen className="group/reasoning">
              <div className="rounded-lg border border-border bg-surface/40">
                <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui-xs">
                  <Sparkles className="size-3.5 agent-signal-reasoning" />
                  <span className="font-medium">思考</span>
                  <span className="text-foreground-subtlest">18 秒</span>
                  <ChevronDown className="ml-auto size-3.5 text-foreground-subtlest transition-transform group-data-[state=open]/reasoning:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="max-w-[68ch] border-t border-border px-3 py-3 text-ui-sm leading-relaxed text-foreground-subtle">
                    先确认幂等键在重试之间是否稳定，再决定改动范围。只看 webhook 入口这一层，避开 ledger writer；
                    改动前跑一遍现有测试建立基线。
                  </p>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </TraceEntry>

          <TraceEntry signal="tool" time="12:44">
            <ToolCard name="codebase_search" detail="idempotency key generation" duration="0.8s">
              <div className="flex flex-col divide-y divide-border">
                {searchHits.map((hit) => (
                  <div className="flex min-w-0 items-baseline gap-3 py-1.5 first:pt-0 last:pb-0" key={hit.file}>
                    <span className="shrink-0 font-mono text-ui-xs">
                      {hit.file}
                      <span className="agent-signal-result">:{hit.line}</span>
                    </span>
                    <span className="ellipsis font-mono text-ui-2xs text-foreground-subtlest">{hit.text}</span>
                  </div>
                ))}
              </div>
            </ToolCard>
          </TraceEntry>

          <TraceEntry signal="assistant" time="12:45">
            <p className="max-w-[68ch] text-ui-base leading-relaxed">
              幂等键在
              <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-ui-sm agent-signal-assistant">handler.ts:42</code>
              每次重试都重新生成 ——
              <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-ui-sm agent-signal-assistant">randomUUID()</code>
              落在重试循环内部。重试次数配置本身没问题，问题在键的生命周期。
            </p>
          </TraceEntry>

          <TraceEntry signal="tool" time="12:46">
            <ToolCard name="read_file" detail="src/webhooks/handler.ts · L38–50" duration="0.2s">
              <div className="overflow-hidden rounded-md border border-border bg-terminal-bg">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 font-mono text-ui-2xs text-terminal-fg/60">
                  <FileCode2 className="size-3" />src/webhooks/handler.ts
                  <span className="ml-auto">38–50</span>
                </div>
                <div className="font-mono text-ui-xs leading-[1.7] text-terminal-fg">
                  {codeExcerpt.map((line) => (
                    <div
                      className="flex"
                      key={line.n}
                      style={line.hot
                        ? { background: "color-mix(in oklab, var(--color-trajectory-tool-call) 12%, transparent)" }
                        : undefined}
                    >
                      <span className="w-10 shrink-0 select-none border-r border-border px-2 text-right text-terminal-fg/45">{line.n}</span>
                      <code className="whitespace-pre px-3">{line.text}</code>
                    </div>
                  ))}
                </div>
              </div>
            </ToolCard>
          </TraceEntry>

          <TraceEntry signal="tool" time="12:47">
            <ToolCard name="edit_file" detail="src/webhooks/handler.ts" duration="1.1s">
              <div className="mb-2 flex items-center gap-2 text-ui-2xs">
                <span className="font-mono text-foreground-subtle">1 个文件</span>
                <span className="font-mono text-diff-added">+2</span>
                <span className="font-mono text-diff-removed">−2</span>
                <Check className="ml-auto size-3.5 text-success" />
              </div>
              <div className="overflow-hidden rounded-md border border-border">
                <LightweightDiffPreview lines={diffLines} showLineNumbers={false} fontSizePx={12} />
              </div>
            </ToolCard>
          </TraceEntry>

          <TraceEntry signal="assistant" time="12:47">
            <p className="max-w-[68ch] text-ui-base leading-relaxed">
              入站事件的 ID 已成为默认幂等键，派发被包进
              <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-ui-sm agent-signal-assistant">seen.once()</code>。
              ledger writer 未改动。
            </p>
          </TraceEntry>

          <TraceEntry signal="tool" time="12:48">
            <ToolCard name="run_tests" detail="pnpm test webhooks" duration="1.8s">
              <div className="font-mono text-ui-xs leading-[1.8]">
                {testLines.map((line) => (
                  <div className="flex gap-2" key={line.text}>
                    <span className={cn(
                      "w-3 shrink-0",
                      line.tone === "pass" && "text-success",
                      line.tone === "strong" && "text-foreground",
                      !line.tone && "text-foreground-subtlest"
                    )}>
                      {line.tone === "muted" ? "$" : line.tone === "strong" ? "·" : "✓"}
                    </span>
                    <span className={cn(line.tone === "strong" ? "font-medium text-foreground" : "text-foreground-subtle")}>
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            </ToolCard>
          </TraceEntry>

          <TraceEntry signal="tool" time="12:48">
            <ToolCard name="bash" detail="pnpm test --filter billing-api" duration="0:31" live>
              <div className="font-mono text-ui-xs leading-[1.8]">
                {liveLines.map((line, index) => (
                  <div className="flex items-start gap-2" key={index}>
                    <span className={cn("w-3 shrink-0", line.done ? "text-success" : "agent-signal-tool")}>
                      {line.done ? (line.text.startsWith("✓") ? "" : "·") : "▸"}
                    </span>
                    <span className={cn(line.done ? "text-foreground-subtle" : "text-foreground")}>{line.text}</span>
                    {!line.done && <span className="agent-caret" />}
                  </div>
                ))}
              </div>
              <Progress value={68} className="mt-3 h-0.5" indicatorClassName="agent-progress-fill" />
              <div className="mt-2 flex items-center justify-between text-ui-2xs text-foreground-subtlest">
                <span>等待 writer 测试结束…</span>
                <span className="font-mono">68%</span>
              </div>
            </ToolCard>
          </TraceEntry>

          {extraMessages.map((message, index) => (
            <TraceEntry signal="user" time={message.time} key={index}>
              <div className="agent-user-surface rounded-lg px-4 py-3">
                <p className="max-w-[68ch] text-ui-base leading-relaxed">{message.text}</p>
              </div>
            </TraceEntry>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 变更文件页：文件清单 + 一处实际 diff，复用同一份 mock。 */
function FilesPanel() {
  const statusColor: Record<string, string> = {
    M: "var(--color-git-modified)",
    A: "var(--color-git-added)",
  };
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[840px] px-8 pt-6 pb-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-ui-lg font-semibold tracking-tight">变更文件</h2>
            <p className="mt-0.5 text-ui-xs text-foreground-subtle">3 个文件 · +44 −2 · 未提交到工作区</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Check className="size-3.5" />全部接受
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          {changedFiles.map((file, index) => (
            <div className={cn("flex items-center gap-3 px-3 py-2.5", index > 0 && "border-t border-border")} key={file.file}>
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded border font-mono text-ui-2xs"
                style={{ color: statusColor[file.status], borderColor: statusColor[file.status] }}
              >
                {file.status}
              </span>
              <span className="ellipsis flex-1 font-mono text-ui-xs">{file.file}</span>
              <span className="shrink-0 font-mono text-ui-2xs text-diff-added">+{file.added}</span>
              <span className="shrink-0 font-mono text-ui-2xs text-diff-removed">−{file.removed}</span>
            </div>
          ))}
        </div>
        <h3 className="mb-2 mt-6 font-mono text-ui-xs text-foreground-subtle">src/webhooks/handler.ts</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <LightweightDiffPreview lines={diffLines} fontSizePx={12} />
        </div>
      </div>
    </div>
  );
}

/** 上下文页：窗口用量与构成，分段条用上下文语义阶而非通用图表色。 */
function ContextPanel() {
  const segments = contextBreakdown.map((item) => ({
    id: item.label,
    percent: item.value / 34.2,
    style: { background: "var(" + item.token + ")" },
  }));
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[840px] px-8 pt-6 pb-10">
        <h2 className="text-ui-lg font-semibold tracking-tight">上下文</h2>
        <p className="mt-0.5 text-ui-xs text-foreground-subtle">这一轮运行里模型实际看到的内容构成</p>
        <div className="mt-5 rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-ui-settings-title font-semibold tabular-nums">34.2k</span>
            <span className="font-mono text-ui-xs text-foreground-subtlest">/ 200k tokens</span>
            <Badge variant="secondary" className="ml-auto">17%</Badge>
          </div>
          <Progress value={100} segments={segments} className="mt-3 h-2" />
          <div className="mt-5 flex flex-col gap-4">
            {contextBreakdown.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-ui-xs">
                  <span>{item.label}</span>
                  <span className="font-mono tabular-nums text-foreground-subtlest">{item.value}k</span>
                </div>
                <div className="agent-context-bar">
                  <span
                    className="agent-context-segment"
                    style={{
                      width: String(Math.round(item.value / 34.2 * 100)) + "%",
                      background: "var(" + item.token + ")"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "缓存命中", value: "81%" },
            { label: "工具轮次", value: "5" },
            { label: "耗时", value: "7m 12s" },
          ].map((stat) => (
            <div className="rounded-lg border border-border bg-card px-3 py-3" key={stat.label}>
              <div className="text-ui-2xs text-foreground-subtlest">{stat.label}</div>
              <div className="mt-1 font-mono text-ui-lg tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 右侧检查区：把运行态、计划、改动和活动放在同一视线里。 */
function InspectorPanel() {
  const [steps, setSteps] = useState(planSteps.map((step) => step.done));
  const toggleStep = (index: number, value: boolean | "indeterminate") => {
    setSteps((prev) => prev.map((done, i) => (i === index ? value === true : done)));
  };
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-panel xl:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-ui-sm font-medium">运行检查</span>
        <span className="font-mono text-ui-2xs text-foreground-subtlest">RUN 07</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-ui-xs font-medium">
            <Activity className="size-3.5 text-foreground-subtlest" />上下文窗口
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-ui-xl font-semibold tabular-nums">34.2k</span>
            <span className="font-mono text-ui-2xs text-foreground-subtlest">/ 200k</span>
          </div>
          <Progress value={17.1} className="mt-2 h-1" />
          <div className="mt-3 flex flex-col gap-2">
            {contextBreakdown.map((item) => (
              <div className="flex items-center gap-2" key={item.label}>
                <span className="w-14 shrink-0 text-ui-2xs text-foreground-subtlest">{item.label}</span>
                <div className="agent-context-bar flex-1">
                  <span
                    className="agent-context-segment"
                    style={{
                      width: String(Math.round(item.value / 34.2 * 100)) + "%",
                      background: "var(" + item.token + ")"
                    }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-ui-2xs tabular-nums text-foreground-subtlest">{item.value}k</span>
              </div>
            ))}
          </div>
        </section>

        <Separator className="my-4" />

        <section>
          <div className="mb-2.5 flex items-center gap-1.5 text-ui-xs font-medium">
            <ListChecks className="size-3.5 text-foreground-subtlest" />任务计划
            <span className="ml-auto font-mono text-ui-2xs text-foreground-subtlest">3 / 4</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {planSteps.map((step, index) => (
              <label className="flex cursor-pointer items-center gap-2" key={step.label}>
                <Checkbox checked={steps[index]} onCheckedChange={(value) => toggleStep(index, value)} aria-label={step.label} />
                <span className={cn("text-ui-xs leading-snug", steps[index] && "text-foreground-subtle")}>{step.label}</span>
              </label>
            ))}
          </div>
        </section>

        <Separator className="my-4" />

        <section>
          <div className="mb-2.5 flex items-center gap-1.5 text-ui-xs font-medium">
            <FileCode2 className="size-3.5 text-foreground-subtlest" />变更文件
            <span className="ml-auto font-mono text-ui-2xs text-foreground-subtlest">3</span>
          </div>
          <div className="flex flex-col gap-1">
            {changedFiles.map((file) => (
              <div className="flex items-center gap-2" key={file.file}>
                <span className="w-3 shrink-0 font-mono text-ui-2xs text-git-modified">{file.status}</span>
                <span className="ellipsis flex-1 font-mono text-ui-2xs">{file.file}</span>
                <span className="shrink-0 font-mono text-ui-2xs text-diff-added">+{file.added}</span>
              </div>
            ))}
          </div>
        </section>

        <Separator className="my-4" />

        <section>
          <div className="mb-2.5 flex items-center gap-1.5 text-ui-xs font-medium">
            <Clock3 className="size-3.5 text-foreground-subtlest" />活动
          </div>
          <div className="flex flex-col gap-2.5">
            {activityItems.map((item) => (
              <div className="flex items-start gap-2" key={item.time + item.text}>
                <span className="mt-1 w-8 shrink-0 font-mono text-ui-2xs text-foreground-subtlest">{item.time}</span>
                <span className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  item.state === "live" ? "agent-live-dot" : "agent-bg-done"
                )} />
                <span className={cn("text-ui-xs leading-snug", item.state === "live" ? "text-foreground" : "text-foreground-subtle")}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-border px-4">
        <Avatar size="sm">
          <AvatarFallback className="bg-secondary text-ui-2xs">AG</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-ui-xs font-medium">Atlas Agent</div>
          <div className="font-mono text-ui-2xs text-foreground-subtlest">claude-sonnet-4.5</div>
        </div>
        <Badge variant="secondary" className="ml-auto">自动</Badge>
      </div>
    </aside>
  );
}

/** 输入坞：模型 / 思考强度 / 附件 / 队列 / 发送，全部是真交互。 */
function ComposerDock({
  running,
  onSend,
  onStop,
}: {
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [queue, setQueue] = useState<string[]>(queueSeed);
  const [model, setModel] = useState("claude-sonnet-4.5");
  const [thinking, setThinking] = useState("medium");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const enqueue = () => {
    const text = draft.trim();
    if (!text) return;
    setQueue((prev) => [...prev, text]);
    setDraft("");
  };

  return (
    <div className="shrink-0 border-t border-border bg-panel px-6 pt-3 pb-3">
      {queue.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-ui-2xs text-foreground-subtlest">队列 {queue.length}</span>
          {queue.map((item, index) => (
            <span className="flex max-w-64 items-center gap-1 rounded-full border border-border bg-background-alt py-0.5 pr-1 pl-2 text-ui-2xs" key={index}>
              <button type="button" className="ellipsis text-left text-foreground-subtle hover:text-foreground" title="取回这条消息" onClick={() => { setDraft(item); setQueue((prev) => prev.filter((_, i) => i !== index)); }}>
                {item}
              </button>
              <button type="button" aria-label="移除队列消息" className="flex size-4 items-center justify-center rounded-full text-foreground-subtlest hover:bg-hover hover:text-foreground" onClick={() => setQueue((prev) => prev.filter((_, i) => i !== index))}>
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-input-border bg-input/30 transition-colors focus-within:border-ring">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="给 agent 下一条指令…"
          aria-label="给 agent 下一条指令"
          className="min-h-14 border-0 bg-transparent px-3 pt-3 pb-1 shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
        />
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger size="sm" variant="outline" className="h-6 gap-1 border-border bg-transparent px-2 text-ui-2xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-sonnet-4.5">claude-sonnet-4.5</SelectItem>
              <SelectItem value="gpt-5.1-codex">gpt-5.1-codex</SelectItem>
              <SelectItem value="deepseek-v3.2">deepseek-v3.2</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-ui-2xs text-foreground-subtle">
                <Sparkles className="size-3 agent-signal-reasoning" />思考 · {thinking}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>思考强度</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={thinking} onValueChange={setThinking}>
                <DropdownMenuRadioItem value="low">低</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="medium">中</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="high">高</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="添加附件">
                <Paperclip className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>添加附件</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-ui-2xs text-foreground-subtle" onClick={enqueue} disabled={!draft.trim()}>
            加入队列
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            {running && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" size="icon-sm" aria-label="停止运行" onClick={onStop}>
                    <Square className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>停止运行</TooltipContent>
              </Tooltip>
            )}
            <Button size="sm" className="gap-1 px-2.5" onClick={submit} disabled={!draft.trim()}>
              发送<ArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-ui-2xs text-foreground-subtlest">
        <span>Agent 可以修改文件并运行命令，请审阅改动。</span>
        <span className="font-mono">本地工作区 · northstar/billing</span>
      </div>
    </div>
  );
}

/** 预览站的 Agent 高保真页：mock 数据 + 真实交互（会话切换、折叠、队列、发送）。 */
export function AgentPage() {
  const [activeId, setActiveId] = useState("r07");
  const [active, setActive] = useState<SessionMock>(sessionGroups[0].items[0]);
  const [extraMessages, setExtraMessages] = useState<{ time: string; text: string }[]>([]);
  const [running, setRunning] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    setExtraMessages((prev) => [...prev, { time: "现在", text }]);
    setRunning(true);
  };

  const selectSession = (session: SessionMock) => {
    setActiveId(session.id);
    setActive(session);
  };

  return (
    <div className="agent-page flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
      <AgentRail />
      <SessionColumn activeId={activeId} onSelect={selectSession} />

      <Tabs defaultValue="trace" className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-panel px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-ui-2xs text-foreground-subtlest">
              <span className="font-mono">{active.project.split("/")[0]}</span>
              <ChevronRight className="size-3" />
              <span className="font-mono">{active.project.split("/")[1]}</span>
            </div>
            <h1 className="ellipsis text-ui-lg font-semibold tracking-tight">{active.title}</h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="gap-1.5">
              <span className={cn("size-1.5 rounded-full", running ? "agent-bg-running" : "agent-bg-paused")} />
              {running ? "运行中" : "已暂停"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <GitBranch className="size-3 agent-signal-reasoning" />2 个分支
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="复制运行链接">
                  <Copy className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制运行链接</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="分享运行">
                  <Share2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>分享运行</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>复制运行 ID</DropdownMenuItem>
                <DropdownMenuItem>导出轨迹</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>从这一步重试</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <TabsList variant="line" className="mx-6 mt-1 h-8 w-fit shrink-0 gap-5 rounded-none px-0">
          <TabsTrigger value="trace" className="px-0.5 text-ui-xs">运行轨迹</TabsTrigger>
          <TabsTrigger value="files" className="px-0.5 text-ui-xs">变更文件</TabsTrigger>
          <TabsTrigger value="context" className="px-0.5 text-ui-xs">上下文</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="trace" className="h-full">
            <TracePanel extraMessages={extraMessages} scrollRef={scrollRef} />
          </TabsContent>
          <TabsContent value="files" className="h-full"><FilesPanel /></TabsContent>
          <TabsContent value="context" className="h-full"><ContextPanel /></TabsContent>
        </div>

        <ComposerDock running={running} onSend={send} onStop={() => setRunning(false)} />
      </Tabs>

      <InspectorPanel />
    </div>
  );
}


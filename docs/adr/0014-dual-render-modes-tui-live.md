# 双渲染模式：TUI 运行态形态与 Standard 并存，可配置切换

动态运行渲染的诉求（借鉴 pi-cc-extensions 的 compact 模式：`Running… · 12s · bash×2 read×3` 摘要行 + 槽位卡 + 完成自动收起）与本仓已验收的 Transcript 渲染（ADR-0013 Recap/Strip）相遇时，有两个去处：把运行态加进现有 Recap/Strip，或另立一套渲染形态。决定**不动已验收的 Standard 渲染，新建 TUI Mode 作为第二渲染形态**——动态运行渲染是 TUI Mode 的专属特性，两模式可配置切换。

## 决定

- **双模式并存，同一出口**：两模式从同一个 `buildTranscriptModel` 派生，分类计数、运行态锚点等新派生量加在模型层，Standard 视图不消费即零改动（现有测试全绿为验收线）。视图层两套组件，互不掺杂。
- **TUI Mode 覆盖范围仅 Process Group 区**（运行摘要行、槽位行、终端块、diff）；user 气泡与 assistant 正文沿用现渲染。全量 TUI 化（正文/markdown 重绘）是另一个量级的工程，留后续迭代另立决定。
- **终端模拟视觉（文本形态，迭代修订）**：**无底无框**——不用背景与边框盒子区分 TUI 区（初版曾给 `--tui-bg/--tui-border` 终端底，验收即推翻：TUI 组以等宽小字浅色融入画布，仅以字色与字符结构表达形态）；令牌只留字色四枚（`--tui-text/--tui-dim/--tui-faint/--tui-run`，浅深双主题各取值）——前三是**字色阶梯**：工具名与思考摘要最强（text）、参数摘要中等（dim）、时间最浅（faint）。计时 tick 只触发重绘（100ms）、取值现场 `Date.now()`（秒数不存 state）；字形动画（spinner 旋转、扫光）走 CSS，不占挂钟 tick。ADR-0001 分层与 check-css-tokens 照常守门。
- **运行组贴底（迭代补充）**：TUI 模式下运行中的组（末轮且驱动运行中或流式草稿）从对话流抽出到滚动区**末尾**渲染——配合贴底自动跟随，运行状态始终在视口底部，与 DSH 的组顶 Recap 拉开形态；历史残留 running 组不抽（不发明「已死」态）。纯思考流式期（组内无 running 工具）头部同样亮「运行中…」（turn 级 live 兜底 `recap.running`），活跃思考行转 spinner——「只有思考时没有任何状态展示」的迭代修复。
- **无工具的组头部不空白（迭代补充）**：纯思考组的结算头部报思考数与耗时——组级跨时长报不出（单条目首末同刻）时，兜底该组 assistant 条目的 `durationMs`（内核的请求耗时，「这组跑了多久」的内核口径）；**回车到首 token 的空窗**（turn 已有 user 回显、尚无任何组）贴底挂空组形态的运行指示，计时锚在 user 条目时刻——请求已发出就不能没有任何状态。
- **字形绘制化与 cc-style 文案（迭代补充）**：符号一律 SVG 绘制并**收进 Icon 组件**（新增 `check` / `spinner` / 复用 `xmark`，20×20 统一规格；chevron 复用既有 `chevron-right`、↳ 用 L 形边框线、● 用 CSS 圆点）——文本字符在等宽栈的字体回退间渲染不一致（大小/基线漂移），初版曾例外保留 braille 字符帧 spinner（cc-style 签名），再迭代推翻：spinner 也是 SVG（270° 圆弧字形 + CSS 旋转），全套字形单一来源。字形槽钉在首行行高内居中（baseline 对齐会把小字形按底边贴到文字基线上）。运行文案定稿 `running...` / 思考行 `思考中`（en "thinking..."；终端标识文案）；`running...` 配 background-clip 文字扫光跑马灯（高亮段用 `--tui-text`，纯令牌派生）。活跃思考行三轮收敛：尾部滚动 → 只报时间 → **还原滚动并加标签**（`spinner + 思考中 + 秒数 + 尾部滚动末 N 行`，1/3/5 可配置）——只报时间看不见思考在说什么，内容要展示；变的只是活跃权（收敛到组内最后一条，见下条）。思考完成展示首行摘要（可点击展开全文）与请求耗时（内核 `durationMs` 兜底——思考占请求主体，同组头部口径；初版「不显示时间」被用户迭代推翻）。spinner 字形的旋转只在真运行上下文驱动（组容器 `[data-live]` 作用域的 CSS 动画）；「运行中」的视觉只在真运行上下文亮（末轮 live / 流式草稿，turn 级 live 只给末组）——历史残留 running 组（中断会话末组）按结算态呈现，行内状态字形定格、不显示挂钟秒数，避免天文数字。
- **运行紧凑槽位与思考活跃唯一化（迭代补充）**：运行中的组默认**紧凑态**——槽位区只亮最后一个活动条目（running 工具亮 spinner、思考亮 spinner + 秒数），点开头部才全量展开全部槽位；长运行平铺全部工具行会淹没当前活动（真实驾驶截图反馈）。全量展开时**已完成的思考也收起**（运行上下文里思考的产出会体现在后续回答中，结算后恢复完整行）。多条思考只有组内**最后一条**活跃，其前的思考一律按静止态呈现——此后的工具都已结算，全组人人在转是假的运行态。活跃权有**两个终结前提**：其一，组必须是 turn 的当前尾部——正文 text 流出会 flush 组（text 是分组边界），组被终结后其内思考即便排在组内末位也已完成，不再转、紧凑态也不再渲染该行（真实驾驶截图反馈：正文已渲染而思考仍在加载）；其二，**思考块自身定稿**——内核 `thinking_end` 显式信号经驱动协议 `thinkingEnd` 帧汇入模型（ADR-0012 补记九），草稿思考完成后即收起，不必等正文开流（`text_end` 前的停顿窗口里思考行不再空转）。
- **结算汇总形态（迭代补充，推翻组头部汇总的初版）**：汇总行是 **turn 级**结构，一轮一行——`Run {n} commands[ · {m} thinking] · {一轮时间} · done {月/日 时刻}`（结论段整合命令数与思考数：纯思考轮只有 thinking、无思考只 commands，动词定稿 `Run`；n/m 由模型层 `Turn.toolsTotal / thoughtsTotal` 派生，一轮时间取 turn 结算耗时、满一分钟进位为 `Xm Ys` 分段，done 后跟本轮完成日期与时刻、两者间以空格相连无点——`done 11/17 1:56 PM` 是 cc 的原样语义「完成于 11 月 17 日 1:56 PM」，初版曾误读为 `done {ok}/{n}` 进度），置于 turn 内容区最前；点击切换**各组明细行的显隐**：收起 = 只留各段回答正文（`文本xxxx / 文本123`），展开 = 每组明细行（`耗时 … · N 次思考 · bash×2`）随其正文依次出现。初版曾把汇总塞进组头部，验收即推翻：汇总的归属是整轮而非单组，组头部的职责只有明细。运行中的 turn 不出汇总行（头部 `running...` 已在报数），结算后出现；纯思考轮（`toolsTotal` 为 0 而有思考）同样出——否则组头部「耗时 … · N 次思考」收不起来、裸露在流里与其它轮的收起形态不一致。
- **运行态形态**：组头部运行态为 `Running… · <秒数> · <分类计数>[ · draft]`（如 `bash×2 read×3`，前 3 类 + `…+N` 截断；draft 后缀标注末轮流式草稿，迭代补），完成翻 `Ran for <秒数> · …`；槽位行（`↳ <spinner|✓|✗> <工具名> <参数摘要> · <秒数>`）行内秒数是 TUI 形态自身的规则，对 Standard 的「行内无耗时」（ADR-0013）不构成修订——运行中取挂钟−条目锚，结算取内核 `durationMs`（权威落盘，无需校准；初版「结算态不显示行内秒」被用户迭代推翻）。计数不去重、不排除 edit/write——Standard 无外层工具卡概念，cc-extensions 的排除规则不成立。
- **展开体 cc 风格（迭代补充）**：槽位点击展开为 `Input` / `Output` 标签分区（终端标识文案，两语言同形）——Input 是 args 键值行式（`command: ls …`；字符串值直书、结构化值 JSON），Output 承载 diff 与输出（运行中实时尾巴，无尾巴 `Pending...` 占位）；展开体竖线与状态字形槽中心齐平、内容与工具名齐平，标签亮（`--tui-text`）、正文 dim。思考行同样可点击展开全文，活跃思考行的尾部滚动即其展开态。初版展开体是 args JSON 块 + 输出平铺，验收后按 cc-extensions 的详情样式重做。行内秒数（槽位与活跃思考）紧跟摘要、不推到行尾，色为字色阶梯第四枚 `--tui-faint`（初版「opacity 派生不另立令牌」被字色三档阶梯的迭代推翻，见前文字色四枚）。展开体以无底无框承载 args/输出/diff 代码面——对 [ADR-0007](0007-light-code-surfaces-with-header.md)「统一表面语言（同底色/圆角/hairline）」的 **TUI 专属修订**：表面让位于融入画布的文本形态，Standard 侧不受影响。
- **计时口径**：锚点 = 条目时间戳（槽位行取调用所在 assistant 条目、组头部取组首条目），渲染时 `Date.now()` 挂钟现场求值，不依赖客户端起表——Drive 与 Live Tail 两路径天然一致；声明到执行的 <1s 间隔视为可接受误差。结算槽位/思考行内秒取内核 `durationMs`（权威落盘），不涉及挂钟校准。
- **自动收起**：组 `live` true→false 边沿 + 250ms 静默期收起；仅收「因 live 强制展开」的组，用户手动开过的不收。（这是与 cc-extensions 对齐的取舍：Web 有滚动空间、自动跳变打断阅读，但「读完即收、界面整洁」胜出——明示记录，推翻时不必考古。）
- **切换配置**（与主题切换同构）：Settings/Appearance 存默认（localStorage，前端偏好不入 session），Session Bar 动作区快切；默认 TUI（迭代修订：初版默认 Standard，后被推翻——运行态是驾驶场景的高频主视角，默认即所见，免一次手动切换；显式存 standard 才回 standard）。

## 考虑过的选项

- **把运行态加进现有 Recap/Strip**：否——已验收形态保持稳定（GLOSSARY Recap「只报可解释的量」与 Strip「行内无卡片无耗时」都无需开例外），且「静态查看 vs 动态驾驶」的两形态定位更清晰。
- **全量 TUI 化**：否——markdown 代码块/diff/列表按 TUI 语言重设计是另一个量级，正文可读性未必更好。
- **仅 Settings 配置**：否——对齐主题切换先例（Appearance 存默认 + Session Bar 快切），用户能边看边对比。
- **槽位卡多槽位平铺**：否——运行中工具各占一行槽位行（并行调用各一行），但不做 cc-extensions 那种子项卡片嵌套；极简行已够承载「跑什么、多久了」。

## 后果

- 新增 `--tui-*` 语义令牌组（浅深双主题成对）；TUI 组件样式一律引用语义层变量。**2026-11 修订（ADR-0018）**：该令牌组整组退役并入全局灰阶——正文 `--code-text`、摘要 `--text-2`、时间 `--text-4`、运行态 `--accent-text`，字色阶梯的档位语义由语义层统一承载；上文「令牌只留字色四枚」的决定相应作废，TUI 不再私有配色。
- 模型层 `GroupRecap` 增分类计数与运行态派生量、`ToolCallItem` 增运行秒数锚点与流式尾巴（`live`）；Standard 不读新字段。
- 协议扩字段见 [ADR-0012 补记八](0012-pi-kernel-drive-integration.md)：`toolCall` 帧带 `args` / `outputTail`，normalize 放行 `tool_execution_start/update`；Live Tail 路径无 update 流，运行行输出区显示占位——两路径能力差异是明示的，不是缺陷。
- Settings/Preview 新增 TUI 模式样张（含运行态 mock），截图验收浅深双主题。
- i18n 新增词条（viewStandard / viewTui / recapMoreTools / outputPending / outputGrowing 等），en/zh 双侧。

## 补记（架构收敛轮）：运行态派生归家 tui-view，四态语义一张表

**问题**：ADR-0014 的运行态派生没有家——tailGroupId / recap.startedAt 进了共享 TranscriptModel（Standard 不消费），compactItem、activeThinkingId、detach 判定、运行秒数三段式判定（组头 / 槽位行 / 思考行各一份）内联在 Transcript / TurnView / TuiGroup 组件体里，与计时 hook 纠缠而不可测；四态映射两份（ToolRow 的 STATE_VIEW 表 vs TuiGroup 的 StatusGlyph if 链，注释自认「新增状态时两处同步」）；formatTokens / formatClock 同名本地版各一份且已漂移（lib 的 formatClock 硬编码 en，中文界面用户气泡仍显 PM）。

**决定**：TUI 运行态判定整体收进 `lib/tui-view.ts` 纯函数层——输入纯数据（TranscriptModel 派生量 + now + 布尔）、无 hook 无 DOM，组件只读结果：activeThinkingIdOf / compactItemOf / slotElapsedOf / thinkingElapsedOf / groupElapsedOf / tuiDetachOf。Turn 增模型层派生量 firstGroupId / tailItemId（与既有 tailGroupId 同一批），TurnView 不再自扫 items 重复推导。四态拆两层：语义层 `lib/tool-state.ts`（标签键 + 色档，`Record<ToolState,…>` 编译期强制补齐），呈现层各形态自选（ToolRow 的 glyph/dot、TuiGroup 的 SVG 字形 Record）。呈现格式化收编 `lib/format.ts` 唯一实现（formatClockAt / formatDateAt / formatTokens 全部 locale 可穿），组件同名本地版删除；`emptyGroupRecap()` 成为首 token 空窗锚组的正典空值，Transcript 不再现场捏造字面量。

**边界**：计时纪律不变（tick 只触发重绘、取值现场挂钟，纯函数不存秒数 state）；「模型算了视图不算」的既有 TUI 专属字段（tailGroupId / recap.startedAt 等）保持原位——归家的是组件内联的那一半，不是把 Standard 不消费的字段再搬一次。

**后果**：ADR-0014 运行态行为首次有可测接口（tui-view.test）；formatClock 的 locale 缺陷随收编修复（中文界面用户气泡与 TUI done 段走 Intl locale）；formatTokens 换 Intl compact（en `1.2k`→`1.2K`、zh 万进制），消费点（Recap / Context Ring / 注解行）随统一。

# Transcript 只渲染活动分支，条目按三级策略呈现

pi 的 session 条目是树且类型多样（十余种 Entry 类型）。我们决定：高保真 v1 的 Transcript **只渲染 Active Branch**（活动叶子沿 `parentId` 回溯到根），被弃分支仅以顶栏「branched」标记示意；条目按三级策略呈现——**消息级**完整渲染（user / assistant / toolResult / bashExecution），**注解级**渲染为细分隔线与灰色小字（model_change / compaction / branch_summary / session_info / `display:true` 的 custom_message），**隐藏级**不渲染（usage 汇总进消息页脚与顶栏统计，context_edit / label / custom / `display:false` 的 custom_message 不显示）。

修订（上游对齐轮）：custom_message（扩展注入、参与 LLM 上下文的用户可见消息）依本条「新增 Entry 类型默认隐藏、显式决定层级」的规则显式定为**注解级**——pi TUI 也有区别于 user 消息的专门渲染；隐藏的只有 `display:false` 变体。

修订二（上下文注入展示轮）：custom_message 在模型层仍走注解通道（不进正文、首条 user 前落 `orphanAnnotations`），但视图呈现从细分隔线小字升级为**可展开的注入行**——行头同工具行形态（落位图标 + 「上下文注入」标题 + customType 摘要），展开为正文与扩展元数据两块代码面（ADR-0007，无头部栏）；`display:false` 仍隐藏，无正文无元数据时退化为静态行头。动机：注入是有实体的内容条目（正文要发给模型、元数据可查证），一行小字承载不了；compaction / branch_summary / session_info 是纯事件注解，保持原样。

修订三（系统提示词展示轮）：system message 从隐藏级升级为注解通道的可展开行——内核每轮对系统提示词做 sections 级 diff、有变化才落盘（`role:"system"`、`content:""`、全文在 `message.sections`，project_context 段即 AGENTS.md 等项目说明的渲染），行头为齿轮图标 + 「系统提示词」 + 段数摘要，展开逐段代码面；首条 user 之前（常见位置）落 `orphanAnnotations`，内核空 diff 落的 `sections:{}` 条目跳过。动机与修订二同源：这是发给模型的真实内容且可查证，隐藏等于查看器丢数据。

## 考虑过的选项

- **分支树浏览器**：有真实价值但属于后期功能，届时配合第三栏扩展点做独立视图。
- **全条目平铺**：噪音过大，违背极简目标。

## 后果

- 客户端需实现 leaf→root 回溯，思路对照 pi 的 `buildContextEntries`，但不做 compaction 投影（那是 LLM 上下文重建，不是 UI 渲染）。
- 新增 Entry 类型时默认落入隐藏级，需显式决定其呈现层级。

## 补记（架构收敛轮）：注解与 user 气泡的显示形状归一，Entry 树真正不出接口

**问题**：本 ADR 的三级呈现策略由模型层分类（哪些条目落注解通道），但注解条目以裸 `SessionEntry` 越接口外泄——AnnotationRow 持 wire 类型的 switch、`as` 强转 4 种类型、手解析 `message.sections`；Turn.user 同样外泄裸 `MessageEntry`。模块头「Entry 树只在实现内部流转，不对外暴露」自相矛盾，视图被迫持有条目分类知识。`toolCallCount`（Composer 徽标退役后的死输出）仍被计算与测试锁定。

**决定**：注解与 user 气泡照 GroupItem 的先例归一成显示形状——`AnnotationDisplay` 判别联合（sessionInfo / branchSummary / compaction / injection / systemPrompt 五类，含各自显示数据）与 `UserMessageDisplay`（text / image 显示块 + 条目时间戳）；分类与过滤口径（display:false 隐藏、空名跳过、空 sections 跳过）收拢在模型层 `annotationDisplayOf` 一处。视图只做「哪类注解 → 图标与文案」的呈现映射，模型层零 i18n 的纪律不变。`toolCallCount` 随退役徽标删除；出口补 `turnGroupAt(model, turnIndex, groupIndex)` 钻取选择子（测试 19 处 kind 判别钻取、三份互不共享的取数 helper 随之消失）。

**后果**：orphanAnnotations 以 `AnnotationCarrier`（id + display）出接口；TranscriptLab / Transcript / TurnView 的 AnnotationRow 传参随改；GLOSSARY TranscriptModel 词条同步。

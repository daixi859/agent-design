# Transcript 只渲染活动分支，条目按三级策略呈现

pi 的 session 条目是树且类型多样（十余种 Entry 类型）。我们决定：高保真 v1 的 Transcript **只渲染 Active Branch**（活动叶子沿 `parentId` 回溯到根），被弃分支仅以顶栏「branched」标记示意；条目按三级策略呈现——**消息级**完整渲染（user / assistant / toolResult / bashExecution），**注解级**渲染为细分隔线与灰色小字（model_change / compaction / branch_summary / session_info），**隐藏级**不渲染（usage 汇总进消息页脚与顶栏统计，context_edit / label / custom 不显示）。

## 考虑过的选项

- **分支树浏览器**：有真实价值但属于后期功能，届时配合第三栏扩展点做独立视图。
- **全条目平铺**：噪音过大，违背极简目标。

## 后果

- 客户端需实现 leaf→root 回溯，思路对照 pi 的 `buildContextEntries`，但不做 compaction 投影（那是 LLM 上下文重建，不是 UI 渲染）。
- 新增 Entry 类型时默认落入隐藏级，需显式决定其呈现层级。

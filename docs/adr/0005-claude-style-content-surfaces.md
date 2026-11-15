# 内容面视觉对齐 Claude 风格：暖纸中性面 + 常暗代码面，macOS chrome 保留

验收反馈调整方向：整体观感与 Claude（claude.ai）对齐。决定：**保留 macOS 骨架**（系统字体栈、交通灯、统一工具栏），**内容面**切换到 Claude 式语言——暖纸色画布（浅 #faf9f5 / 深 #262624）、赤陶强调（#d97757）取代系统蓝、用户气泡改为中性浅底深字（弃用 iMessage 蓝渐变）、**代码块在两种主题下都用深色底**（配 github-dark 高亮）、Thinking 由紫色改为暖灰、Sidebar 选中态由强调色填充改为中性灰底、Sidebar 条目改单行（不展示模型名）。本 ADR 修订 ADR-0001 示例中的颜色决策；token 三层结构与「组件只引用语义层」规则不变。

## 考虑过的选项

- **保持 Apple 系统蓝 + iMessage 气泡**：被否——用户明确要求对齐 Claude。
- **代码块跟随主题明暗**：被否——常暗代码面是 Claude 的签名特征，且让 Shiki 退化为单主题（简化渲染层）。

## 后果

- 语义层新增 `--bg-selected`、`--code-text`、`--inline-code-bg`、`--primary-btn-bg/fg`；`--bubble-user-bg` 从渐变变纯色。
- Diff 色板按「永远落在深色代码面上」取值，两主题共用。
- Thinking 卡片视觉重量降低（灰调），签名元素让位给常暗代码面。

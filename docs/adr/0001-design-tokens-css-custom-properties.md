# 设计令牌采用原生 CSS Custom Properties（三层结构）

UI 要求苹果极简风格且后期需频繁调整样式。我们决定不引入 Tailwind 或 CSS-in-TS，而是用原生 CSS Custom Properties 建三层令牌：**原始值**（primitives：色板、字号、间距刻度）→ **语义变量**（semantic：surface/text/accent 等，主题在此层切换）→ **组件变量**（component：单个组件可覆写的局部默认值）。主题（浅/深）只需替换语义层，组件永不感知主题名。

## 考虑过的选项

- **Tailwind CSS v4（`@theme`）**：书写快，但样式散落在 className，批量调整不如变量法直接，且引入原子类心智负担。
- **vanilla-extract**：令牌有类型检查，但多一层构建链，对「改个变量就能换肤」的目标没有额外收益。

## 后果

- 组件样式用 CSS Modules，引用语义变量；不出现硬编码颜色/间距。
- 后期如需类型安全的令牌，可在原始值层生成 TS 常量（单一数据源），不必推翻结构。

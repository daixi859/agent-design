# 轻量自研 i18n

界面文案双语化（英文 / 中文）不引第三方库：`src/lib/i18n.ts` 收录双字典，英文为源语言；`useLocale` hook 以窗口事件同步（与 `useTheme` 同款模式）；当前语言承载在 `<html lang>`，由 index.html 内联脚本首帧前确定——默认跟随 `navigator.language`（`zh*` → 中文），手动选择持久化到 `localStorage`。唯一切换入口是设置壳 Appearance 页的语言分段控件（各项用本名 English / 中文，不随界面语言翻译）。文案规范随之修订：AGENTS.md「UI 文案一律英文」改为「英文为源语言，en/zh 两侧同步维护」。

## 考虑过的选项

- **react-i18next**：被否——本应用 chrome 文案仅约 50 条，插值只有两处（`sessionNamed` / `tokensBefore`），命名空间、复数、懒加载等机制全部闲置；自研约 80 行零依赖，与项目「不引状态库 / 手写紧凑格式」的一贯取向一致。字典 key 为稳定字符串，将来迁移 i18next 可平移。
- **默认英文**：被否——用户明确要求跟随浏览器语言；持久化只记手动选择，覆盖自动探测。

## 后果

- 新增 UI 文案必须同时在 en / zh 两字典补齐（zh 侧 `Record<MessageKey, string>` 类型约束兜底，漏译编译期报错）。
- 极简插值 `translateVars`（`{name}` 占位）只服务两处；无复数 / 日期本地化机制——相对时间在 `format.ts` 内按 locale 手写双分支（`5m` vs `5分钟`）。
- 渲染样张（Transcript samples 的消息正文、TYPE 字阶例句、DIFF 内容）是「数据标本」而非界面文案，不进字典，维持录制原文。
- `currentLocale()` 读 `<html lang>`，与主题（`data-theme`）同构：非 React 代码（格式化函数）可直读同一事实源。

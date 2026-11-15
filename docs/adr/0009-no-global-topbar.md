# 移除全局顶栏，改分布双头部与独立设置壳

应用壳不再有全局 TopBar。品牌与动作收进 **Brand Float**：固定视口左上角的单枚按钮，静止显示 π，hover 淡入动作图标（主壳 = 侧栏开关，设置壳 = 返回），无底色、边框与阴影，与所在表面融为一体；主壳与 Settings 常驻。Session 标题、branched 徽标与动作（浏览器全屏、主题切换）下沉到内容区标题栏 **Session Bar**（model/tokens/cost 统计展示已移除，ADR-0010 同期）。**Settings** 为独立整页双栏壳（自有导航：Preview、Appearance、About），进入时整体替换主壳，侧栏复用 `--sidebar-width` 与 `--bg-sidebar`（左缘不动）。路由 `/settings` 嵌套（默认重定向到 Appearance），`/overview` 重定向并入 Preview；Code Stream 舞台页已整体移除（ADR-0010）。侧栏收起/展开以宽度动画过渡（`--duration-slow`），Session Bar 让位 padding 同步过渡。macOS 交通灯视觉件随顶栏一并移除。

## 考虑过的选项

- **保留全局顶栏只换内容**：顶栏在只读查看器里长期只有一条真实信息（session 标题），其余全是入口按钮；砍掉后每个头部只服务自己的区域，信息离使用它的地方更近。
- **交通灯迁入浮动标题**：浮动件变宽变重，收起后压在内容区上时观感割裂；π logo 已接管品牌位，语义重复。
- **给 Brand Float 加胶囊底（底色/边框/阴影）**：与侧栏、收起后的内容区两种背景都要融合，任何底色都会在其一表面上显得突兀；hover 时的 `--bg-hover` 圆底已足够提供按钮可供性。
- **Brand Float 收起时滑移到内容区**：侧栏本在视口最左缘，固定左上角的按钮展开时自然盖侧栏、收起后自然落内容区，滑移动画没有可感知的必要。
- **设置页内嵌主壳内容区**：三层嵌套布局（主侧栏 + 设置侧栏 + 内容），两条导航动线互相挤压；独立整页双栏各自干净。

## 后果

- 头部功能按区域分布：标题/全屏找 Session Bar，品牌/收起找 Brand Float，设置导航找 `features/settings`。
- Brand Float 固定左上，被覆盖区域（主侧栏头部、收起后的 Session Bar 左端、设置导航顶部）需预留让位空间，几何由 `--brandfloat-height` / `--brandfloat-width` 约定；π 与动作图标的切换是 hover 交叉淡入淡出，点击即动作，无二级菜单。
- `--topbar-height` 更名 `--sessionbar-height`，`--z-topbar` 更名 `--z-float`；原顶栏统计推送链（topbar-stats → sessionbar-stats）随统计展示移除而删除，branched 徽标改由窄化的 `session-badge` 推送。
- Code Stream 舞台页已移除（ADR-0010），Brand Float 无例外常驻。

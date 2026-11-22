# 样式去重的三档机制与语义层准入：配方归原语，交互留消费方

盘点发现三类系统性重复：同一表面配方在多个 module.css 里逐字重写（浮层卡面 4 写、
发丝面板 7 写、胶囊 7 写、eyebrow 4 写、截断三件套 7 处），同一关注点被打包进一条
令牌值（`--shadow-card`/`--shadow-popover` 内嵌发丝环），以及令牌住错层（组件参数占
语义层名额）。去重机制按「交互 / 表面 / 文本微件」分三档；语义层的准入标准随之写清
为两条：**随主题变化、一类信息一档**——引用数不是标准。

## 决定

**去重三档机制**

- **交互与结构 → React Base Component**：`<Button>`（ghost 配方 + `:where()` 零特异性
  基座）、`<Tag pill tone>`（胶囊几何 + 四档色调变体）。span 徽标走 Tag 组件；
  **可交互胶囊（Seat 按钮、加号、队列头）不经多态 Tag**——SelectMenu trigger 的
  anchorRef 与 aria-haspopup/expanded 语义留在消费方的原生 button 上，经 `composes`
  从 tag.module.css 取配方，hover / disabled 差异留在消费方类。
- **纯表面配方 → 共享 CSS 原语**：`components/surface.module.css` 的 `.elevated`
  （浮层标准面：elevated 底 + radius-lg + 阴影 + 发丝环）与 `.panel`（发丝内框）；
  配方 `:where()` 零特异性，消费方 composes 引用、只写与配方的差（Button 基座的
  既定模式推广到 CSS 层）。底色与圆角因场景而异的配方（`.panel`）只收不变量。
- **文本微件 → global.css 工具类**：`.ellipsis`（既有）收编全部手写三件套；新增
  `.eyebrow`（字距 + 大写归一处），字号、行高与颜色随场景。

**投影与发丝环拆分**

`--shadow-card` / `--shadow-popover` 只留投影几何；发丝环由 `--shadow-hairline`
独立承载，消费处逗号组合（`box-shadow: var(--shadow-popover), var(--shadow-hairline)`）。
环档统一走 `--separator`：原三档内嵌环（0.05 / 0.08 / 0.09）是同带挤档（ADR-0018
病灶），统一后 card/popover 的环略变实——浮层环从不承担层级信息（层级由投影几何
承载），微视觉变更验收确认。

**语义层准入与清理**

- 准入标准：**随主题变化的值 + 一类信息一档**。单文件消费不构成降级理由
  （`--code-*`、`--diff-*`、`--bubble-*` 等主题相关令牌引用再少也住语义层）。
- 组件参数与单文件布局派生值出语义层：`--think-tail-lines`（TuiGroup 内联发布的
  设置项，CSS 侧本就有 `var(--x, 3)` 兜底，组件层在 `.group` 补默认值）、
  `--bubble-measure`（transcript 单文件消费，随 `.wrap` 定义）。
- `--brandfloat-height/width` 合并为 `--brandfloat-size`（同一 32px 方形按钮的两名）。
- 死令牌删除：`--tracking-caption`、`--duration-base`；composerCard 归队
  `--radius-lg` 后 `--radius-xl` 随之死亡删除。

## 考虑过的选项

- **多态 Tag 吸收可交互胶囊**（as="button" + forwardRef）：否——SelectMenu trigger
  的 ref/aria 语义经组件转手徒增复杂度；composes 已把配方单一来源化，交互语义留在
  原生 button 更简单。
- **把手写 ghost 的四处（groupToggle / segment / codeAction / recap）收进 Button
  基座**：否——它们的 hover 语义各不同（只变字色 / color:inherit / grid 交叉淡入），
  收编即视觉变更；且 rowAction / queueAction / sendButton / stopButton 本就基于
  Button（「绕过基座」是盘点误报，实际债比报告小）。
- **状态点（3 写）也抽共享配方**：否——几何已单源于 `--size-dot`，共享只剩 3 行
  平凡规则；为它建全局工具类的机件成本高于收益。
- **低引用原始档（text-callout / leading-body / space-8 等各 1 处）顺势删除**：否——
  ADR-0018 的规矩是拉不开档距才合并，单凭引用少不删；留待下次档距复盘。

## 后果

- 语义层 49 → 46（降级 2 + brandfloat 合一），原始层删 3 个死令牌 / 死亡档。
- `surface.module.css` / `tag.module.css` 成为表面配方与胶囊配方的单一来源；新增
  共享件进 Preview 清单（Tag 变体样张）。
- `surface.module.css` 无 TSX 直引，其规则经消费方的 composes 依赖进入产物（构建
  产物已验证：类定义与运行时 class 映射均在场）。
- 新增第五道守门 `check:token-sync`：dsh-ui 手工快照与 app 令牌层的值漂移即时变红，
  「人工同步」义务变为机器执行（脚本只比对快照声明过的令牌）。
- 视觉变更仅三处（均已确认）：双头部栏 padding-inline 统一为主壳序（4/3）、
  composerCard 圆角 `--radius-xl` → `--radius-lg`（与其余浮层拉齐）、浮层发丝环
  统一到 `--separator` 档（略变实）。

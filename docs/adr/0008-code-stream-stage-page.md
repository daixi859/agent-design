# Code Stream 舞台页：真实 session 数据预演流式生成观感

> **状态：已失效（superseded）**——本决定随 Code Stream 全链路移除而作废，见 ADR-0010；
> 零 chrome 舞台原则不再有承载页面。

用户提出「代码块动态视图，真实数据 mock」。决定新增独立路由 `/stream`（**Code Stream** 舞台页）：从本机 session JSONL 提取 assistant 输出的真实代码围栏作为驱动数据，以字符级自适应流入 + 节流 Shiki 重高亮（约 80ms）预演未来接入 agent loop 后的流式观感。页面沿用既有 token 做安静舞台（控制条仅 Replay / 上一个 / 下一个 / 速度），签名元素让位给动画本身；播完一块停住，接力权交给用户。本页是设计验收样张，不改动 Transcript 主链路。

## 考虑过的选项

- **手写代码样张**：被否——项目原则是直读本机真实数据（ADR-0002），125 个 session 围栏充足，编造数据反而失真。
- **塞进 ComponentGallery 或直接改 Transcript 的 CodeBlock**：被否——Gallery 区块空间局促撑不起完整编排；Transcript 主链路没有流式数据来源，验收风险不对称。
- **流入完成后再一次性高亮**：被否——上色闪变会露馅，流入中实时高亮才与 Claude/ChatGPT 流式观感一致。
- **自动接力播放列表**：被否——验收者需要注意力控制权；自动播一块展示生命感即可。
- **显式动画开关**：被否——`prefers-reduced-motion` 直接呈现完成态即可，降级不该变成需要人管理的选项。

## 后果

- 新增只读提取端点（扫 session → 抽围栏 → 按语言/行数挑选），与现有 API 层同构；无围栏数据时用本仓库源码兜底。
- Transcript 的 `CodeBlock` 不受影响；将来 agent loop 接入时，流式渲染逻辑可从本样张迁入。
- 头部栏获得第二种状态语言：流入时「streaming」呼吸小字 + 块状光标，播定后恢复 lang + Copy——ADR-0007 头部栏语义的延续。

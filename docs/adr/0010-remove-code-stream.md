# 移除 Code Stream

Code Stream（/stream 舞台页，ADR-0008）整条链路移除：客户端路由与 `CodeStreamStage` 组件、服务端围栏提取端点 `/stream-samples` 及其缓存、`shared/pi-types` 中的样张类型、设置导航入口、GLOSSARY 词条一并删除。设置侧栏导航收敛为 Preview / Appearance / About 三项。Brand Float 恢复无条件常驻（不再有舞台页例外），ADR-0008 的零 chrome 舞台原则随之失效。

## 考虑过的选项

- **保留代码只摘入口**：被否——高保真验收阶段聚焦主体验，死代码与「只读查看器」的单一叙事相悖；将来若重启流式预演，git 历史可整段找回，服务端的流式高亮经验可迁移。
- **暂时注释隔离**：被否——半死不活的代码比没有更难维护，类型与依赖（Shiki、流式节流）会随主链路演进而漂移。

## 后果

- `Icon` 集中的 `terminal` / `play` / `pause` 保留——它们是通用图标库成员，非 Code Stream 专属。
- 服务端 API 只剩 `/sessions`、`/session/:id`、`/session/:id/tail` 三组只读端点。
- ADR-0008 标记 superseded；ADR-0009 中涉及舞台页例外的句子同步修订。

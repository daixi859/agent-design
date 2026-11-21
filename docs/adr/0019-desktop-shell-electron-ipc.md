# 桌面壳：main 直装内核，IPC 承载驱动协议，浏览路径走自定义协议

ADR-0012 预留 `packages/desktop`：「main 进程直接 import core，以 IPC 实现同一协议」。第一轮尝试的遗留物（`build/runtime`、`release/win-unpacked`，均未入库）走的是另一条路——把 server 整体打进 main、渲染层连回环端口：必须监听端口，且把 Server Lease 从「同机唯一客户端」变成「同端口唯一连接」，僵尸治理跨进程化。本轮按「不启端口服务」的要求清除遗留物，按 ADR-0012 原定路线重建桌面壳。

## 决定

- **main 直装内核，零数据服务端口**：Electron main 进程直接装配 `@pi-studio/core`（`SessionRegistry` + `openPiSession`），不启动任何 HTTP/WS 服务；驱动协议经 main ↔ 渲染层的进程内桥承载。唯一的端口出现在 dev 形态——vite 自己的静态开发服务器（dev 工具，不是数据服务）。
- **控制层传输无关**：`ws-gateway` 中真正承载协议语义的帧处理（attach 幂等重放、Server Lease、attached 帧组装、drive → commandFailed/disposition 映射）抽成传输无关的控制层；`ws-gateway` 收缩为 WS 适配器（心跳传感器 + socket 生命周期），desktop 写对称的 IPC 适配器——端口/进程消亡是可靠事件，心跳整个免除。协议语义单源（ADR-0012「协议是唯一缝」），web 与桌面同享补记十一/十六的竞态语义。控制层与浏览器数据端点同居 server 包（desktop 经 workspace 依赖复用，依赖方向单一）。
- **浏览路径走自定义协议**：注册 `app://` 标准 scheme（secure + fetch 支持），`protocol.handle` 把 `/api/*` 在 main 进程内直连 pi-data 拆出的端点路由纯函数（path → 数据，无 `node:http` 类型）；渲染层的相对路径 `fetch` 原样工作。`app://` 同时承载生产静态资源与 React Router 的 history fallback。
- **渲染层复用 app，四条许可缝**：① preload 暴露 `window.piDesktop`（`apiFetch` / `createDriveSocket`；contextIsolation 开、nodeIntegration 关）；② pi-client 的 `get()` 加可注入 fetch 缝（缺省 `window.fetch`）；③ DriveClient 单例加 `configure()` 缝（缺省真 WebSocket 不变）；④ app 引导检测 `window.piDesktop`：接通两条缝并跳过 SW 注册（桌面无 PWA 意义）。四条即全部许可改动，浏览器形态行为不变。
- **dev 拓扑**：`dev:desktop` = 自写编排脚本（fork vite → esbuild watch 编 main/preload → electron 加载 `localhost:5173`），退出级联清理，不引入编排依赖；dev 下数据同样全走 IPC，vite 的 `/api` `/ws` proxy 原样保留给浏览器形态。
- **打包链**：esbuild 打 main/preload——workspace 包（core / shared / server 的控制层与端点路由）源码内联，第三方依赖（`@earendil-works/*`、`ws` 等）external 随 node_modules 进 asar（native/wasm 资源 unpack）；electron-builder 出 NSIS 安装包 + portable。第一阶段只做 Windows。
- **单实例锁**：`requestSingleInstanceLock`，第二次启动聚焦已有窗口——与租约语义天然对齐，`serverBusy` 在单窗口下实际不可达，控制层代码不动。
- **Windows 原生标题栏先行**；自绘窗框与品牌位融合留作后续独立议题。

## 考虑过的选项

- **回环 HTTP（遗留物路线）**：开端口违反本壳的第一要求；租约跨进程化让补记十六刚收敛的「属主 = 连接」语义复杂化；弃并清除。
- **逐命令 IPC invoke 桥**：放弃「协议是唯一缝」，渲染层分支两套连接语义；弃。
- **RPC 子进程**：ADR-0012 已否（多一跳序列化 + 子进程生命周期管理），不翻案。
- **desktop 复制一份浏览数据层**：两处真相源；弃——端点路由纯函数留 server，desktop 引用。
- **编排依赖（concurrently 等）**：沿 ADR-0012「不引入运行器」纪律，自写脚本。

## 后果

- web 形态（server + vite）与 desktop 并存，desktop 是增量不是替换；`packages/desktop` 正式入库，typecheck 引用图纳入四道检查。
- Server Lease 在桌面壳下退化为单窗口语义：属主存活面从「WS 连接 + 心跳」平移为「渲染进程存活期」，窗口重载映射为重连重放（use-drive 既有契约），窗口关闭即释放名下会话。
- pi-data 拆出端点路由纯函数，server 的 `main.ts` 留 http 适配壳；REST 行为不变。
- 交付判据：四道检查全绿；`dev:desktop` 可浏览 + 可驱动；打包产物安装后 `app://` 下路由刷新不 404。

## 补记一（落地实证轮）：跨源 fetch 的硬约束、SDK 的解析位置、路径归一

三处「纸面推演通、真机不通」的假设，在此记录以免后人重走。桌面壳的端到端冒烟（生产 `app://` 形态与 dev vite 形态各一遍）已覆盖下述全部结论。

**① dev 形态取数不能走 `app://`（Chromium 硬限制）。** 原设计是「渲染层相对路径 fetch 原样工作」——生产形态成立（页面与 `/api` 同源在 `app://` 下），但 dev 形态页面由 vite 供给、源是 `http://localhost:5173`，此时 `fetch("app://pi-studio/api/sessions")` 被 Chromium 直接拒绝：*Cross origin requests are only supported for protocol schemes: chrome, chrome-extension, chrome-untrusted, data, http, https*。CORS 头救不了，这是 scheme 白名单。

决定：**`apiFetch` 统一走 IPC**（`ipcRenderer.invoke` → main 内调同一份 `resolveApi`），不做「页面在 app:// 就同源 fetch」的分支——preload 跑在 contextIsolation 的隔离世界，从那里探页面源不可靠，而两条形态统一走 IPC 后行为逐条相同。`app://` 的 `/api` 分支保留：生产页面同源，供 devtools 直接 fetch 与调试兜底，成本近零。这也意味着「浏览路径走自定义协议」的原决定被收窄为「页面与静态资源走 `app://`，取数走 IPC」——两者都在 main 进程内直答，无端口、无回环，ADR 的**意图**未变。

**② pi SDK 必须显式进 desktop 的 `dependencies`。** 「workspace 源码内联、第三方 external」在 pnpm 的严格布局下有个前提：external 的包必须能从**产物所在位置**解析到。实测 `packages/desktop/dist/main.js` 报 `Cannot find module '@earendil-works/pi-coding-agent'`——该包只在 `packages/core/node_modules` 有链接。修法是 desktop 自己声明这个依赖（pnpm 于是链接到 `packages/desktop/node_modules`），不是把它打进 bundle：SDK 带 quickjs-wasi 等运行时资源，内联会踩动态路径与 wasm，故 external 策略不变。

**③ 静态目录必须先 `resolve` 再比。** `app://` 的目录穿越守卫用 `target.startsWith(distRoot + sep)` 判定；而 `distRoot` 直接来自调用方（Windows 上常带正斜杠），`path.resolve` 产出反斜杠——比较恒假，**首页一律 403**（表现为白屏、`document.title` 为空）。修法：`handleAppProtocol` 入口即 `resolve(appDist)` 归一。冒烟里「标题为空 + SPA fallback 403」就是这条的指纹。

**④ 窗口生命周期在 connect 时自动绑定。** `destroyed` / `render-process-gone` 不该依赖调用方记得调 `bindWindow`（漏调的后果是被驱动会话永不释放，pi CLI 无法接管）。改为首次 connect 时按窗口挂上（`WeakSet` 去重），`bindWindow` 保留为窗口尚未连协议时的显式出口。

**实测覆盖（生产 / dev 两形态逐条相同）**：preload 桥形状、`apiFetch` 取数（173 会话 / 目录 10 模型）、未知端点 404、坏参数 400 文案、SPA history fallback 200、attach → attached → release → released、**窗口重载后新连接顶替旧连接并成功重连**、控制台零错误。React 真实渲染（侧栏项目 + Transcript 首屏）。

## 补记二（打包轮）：预加载必须是 CJS、workspace 包的位置、asar 里的两笔体积账

打包链落地时撞到的四条硬约束与两笔体积账，逐条记下（安装包与 portable 均已实机验收，清单见 `.scratch/desktop-shell/acceptance/`）。

**① 沙箱化 preload 只能是 CJS 单文件。** 原计划的 `dist/preload.js` 在 `sandbox: true` 下不可用——Electron 的沙箱 preload 不加载 ESM。产物定为 `dist/preload.cjs`（esbuild 用 ESM 语法写、按 `format: "cjs"` 输出），main 仍是 ESM（Electron ≥28 支持）。这解释了为什么两个入口的模块格式不对称：一个由 Electron 的 ESM 支持决定，一个由沙箱限制决定。

**② workspace 包在 desktop 的 `dependencies` 里是错的。** 它们已被 esbuild 内联进 `dist/main.js`，留在 `dependencies` 只会让 electron-builder 把 `.ts` 源码也装进 asar。移入 `devDependencies`（构建期依赖），`dependencies` 只留 `@earendil-works/pi-coding-agent` —— 即「产物运行时真正会 `require` 的东西」这一判据。

**③ 两笔体积账（asar 101 MB → 69 MB）。** `**/*.map` 独占 30 MB（依赖树的 sourcemap，运行时零引用）；`pi-coding-agent` 的 `docs` / `examples` 约 3 MB（发布附带品，不被 import）。两者都进 `files` 排除清单。反过来**不能**排除的是各 provider SDK 的 `src` / `dist`——那是运行时真实 import 的目标，即便我们只用其中一个 provider。

**④ wasm 的 asar 语义：`require.resolve` 返回 asar 路径，读盘由 Electron 透明重定向到 `.unpacked`。** 打包形态实测：`createRequire(...).resolve("quickjs-wasi/quickjs.wasm")` → `app.asar\node_modules\quickjs-wasi\quickjs.wasm`，`readFileSync` 拿到 637,405 字节，`WebAssembly.compile` 通过。这条路径就是 pi-codemode 的真实取用方式（`getQuickJSWasmPath()`），故 codemode 在打包形态可激活有据可依。`asarUnpack` 覆盖 `**/*.wasm` / `**/*.node` 仍保留：`photon-node` 这类按 `__dirname` 拼路径交给第三方加载器的资源，需要真实文件路径。

**⑤ 图标的单一品牌源。** 打包图标不另画：`scripts/make-icon.mjs` 解码 web 端的 `packages/app/public/icons/icon-512.png`（zlib + 手写 PNG 解码 / ICO 封装，不引图形库），产出 9 档尺寸的 `build/icons/icon.ico`。桌面与浏览器共用一张源图，品牌不会两处漂移。

**⑥ portable 启动器先 fork 后退场。** electron-builder 的 portable 目标把应用解到 `%TEMP%\<guid>` 再启动，**启动器本身随即退出**。因此「杀启动器」不等于「关应用」——冒烟脚本曾因此留下孤儿进程。真实使用无此问题（用户关窗即退），但任何自动化都必须等应用进程退出，不能只看启动器。

**打包形态实测（win-unpacked / portable / 安装后 三种布局逐条相同）**：`app://` 同源取数 200（173 会话）、未知端点 404、IPC 取数模型目录 10 项、坏参数 400 文案、深链刷新不掉 404、attach → attached → released、重载后重连、`driven` 标记随租约开合、二次启动 `exited(0)` 且窗口仍是一个、关窗 `exit(0)` 且 `before-quit` 的 `disposeAll` 无异常。安装包经静默安装到临时目录 → 启动复验 → 静默卸载，安装目录、桌面与开始菜单快捷方式、卸载注册项均无残留。

## 补记三：无菜单栏，以及为此补回的两条 dev 加速键

Electron 默认给应用挂一份菜单（File / Edit / View / Window），在 Windows 上是窗口内、标题栏之下的独立一行。本壳没有任何能用菜单承载的命令——没有打开/保存/导出/帮助，窗口控制已由原生标题栏承担——这一行纯粹白占 30px 高度且与产品的极简取向相悖。

决定：`Menu.setApplicationMenu(null)`。代价是菜单顺带提供的**加速键**一并消失（Ctrl+R 重载、F12 / Ctrl+Shift+I 开发者工具、Ctrl+Q 退出等）。

这两条中只有前两条有价值，且只在 dev 形态有价值（生产不该给用户开发者工具入口）。故 `createWindow()` 里按 `DEV_URL` 是否存在挂一个 `before-input-event` 钩子，补回 Ctrl+R 与 F12 / Ctrl+Shift+I；生产不挂。退出走 Alt+F4 / 关窗按钮（Windows 原生行为，与菜单无关）。

**实测**（CDP 派发真实按键，走宿主输入管线）：
- dev：Ctrl+R → 页面重载（文档标记消失）；F12 → `devtools://` 目标出现
- 生产：两条键均无响应（符合「不给用户开发者工具入口」）

另一项顺带实测：菜单的 Edit 组（剪切/复制/粘贴）**不影响**输入框的 Ctrl+V——Chromium 原生处理剪贴板，与 Electron 菜单无关。已用真剪贴板内容（`clipboard-paste-check-42`）经 CDP 组合键粘贴进输入框并读回验证。

## 补记四（评审轮）：双轴评审后的五处收口

工单 8 之后对整个 diff（HEAD…工作区）跑了一次双轴评审（规范轴 + 规格轴，各自独立子代理）。规格轴判定主体忠实实现、无高危偏差；规范轴与规格轴共点出五处值得当场收口的东西，逐条处置如下（评审全文见验收记录）。

**① 窗口底色是凭空发明的第四个底色（规范轴·硬性）。** `backgroundColor: "#f4f2ec"` 不匹配任何语义令牌，也没有深色变体——深色主题下首帧闪白。修法：改取 `--bg-canvas` 的浅色值 `#faf9f5`（ADR-0001 表面阶梯的画布档），注释写明「窗口铬读不到 CSS 变量，抄值须与 tokens.semantic.css 成对改」。根治（main 读令牌文件）属自绘窗框议题，届时一并做。

**② /api 分发装配曾有两份字面量（规范轴·重复）。** 「剥前缀 → resolveApi → unmatched 落 404」在 app:// 分支与 IPC 通道各写一份，连 404 文案都成对复制。收口：server 包新增 `dispatch-api.ts`（`dispatchApi(pathname, query, deps)`），两个传输层各剩一行；404 文案随之单源。装配单源补齐了「端点语义单源」的最后一块。

**③ IPC 通道名曾靠注释手工同步（规范轴·重复）。** `pi-desktop:*` 七个字符串在 main 侧模块与 preload 各写一份，漂移即桥静默失效且无测试可抓。收口：desktop 包内 `channels.ts` 单源（零依赖，preload 沙箱也能打包），`DRIVE_CHANNELS` 五条 + `API_CHANNEL` 一条，两侧都从它取值。

**④ apiDeps 组装曾有两份字面量（规范轴·重复）。** `{ isFileDriven, catalog }` 在 desktop/main 与 server/main 各写一份。收口：`drive-assembly.ts` 新增 `browseApiDeps(registry)`（与 `registryDriveDeps` 同一先例：registry 的窄投影），两形态共用。

**⑤ 环境变量命名与规格对齐（规格轴·低）。** 规格写 `VITE_STUDIO_PORT`，实现误作 `PI_STUDIO_DEV_PORT`。已统一为 `VITE_STUDIO_PORT`（vite.config 与 dev.mjs 共读不变）。

评审同时点名的两处**经判断后保留**（不收口）：`use-drive.ts` 的 `autoConnect` + 模块装载期 `isDesktopShell()` 探针——浏览器形态缺省行为逐条不变，仍在四缝「向后兼容」精神内，但按字面超出「四条即全部许可改动」，故在此补记（四缝实为四缝 + 单例构造期探针一处）；窗口导航守卫（外链交系统浏览器、禁窗口内导航）——规格未写但属桌面壳的天然安全边界，保留。

/** IPC 通道名的单源（preload 与 main 各写一份字面量、靠人眼同步的教训：
    漂移即桥静默失效，且没有任何测试能抓到——通道名是字符串，拼错不报错）。
    main / preload / ipc-driver / api-channel 全部从这里取值；
    本文件刻意零依赖（preload 沙箱里也要能打包进去）。 */

/** 驱动协议：连接、出帧、断开（渲染层 → main 的 invoke）与入帧、断连通知（main → 渲染层的 send） */
export const DRIVE_CHANNELS = {
  connect: "pi-desktop:drive-connect",
  frame: "pi-desktop:drive-frame",
  disconnect: "pi-desktop:drive-disconnect",
  inbound: "pi-desktop:drive-in",
  closed: "pi-desktop:drive-closed",
} as const;

/** 浏览取数（渲染层 → main 的 invoke，ADR-0019 补记一） */
export const API_CHANNEL = "pi-desktop:api";

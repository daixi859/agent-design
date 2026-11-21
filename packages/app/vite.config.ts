import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** dev 拓扑（ADR-0012）：REST 与 WS 都代理到独立 server 进程（浏览器形态）。
    桌面壳的 dev（ADR-0019）不使用这两个代理：页面里的取数走 preload 的 IPC 桥，
    驱动协议走 IPC 适配器，不需要任何数据服务进程。
    端口与 server 同源一参（PI_STUDIO_PORT，默认见 server/main.ts）：
    默认 3141 避开本机代理占用的 3001，否则 vite 起来也代理不通 */
const SERVER_PORT = process.env.PI_STUDIO_PORT ?? "3141";
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

/** dev 服务器自己的端口：桌面壳的编排脚本（desktop/scripts/dev.mjs）读同一个变量，
    改端口只改一处；strictPort 让「端口被占」当场报错，而不是静默换一个端口让 electron 连错。 */
const DEV_PORT = Number(process.env.VITE_STUDIO_PORT ?? "5173");

export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      "/api": SERVER_ORIGIN,
      "/ws": { target: `ws://127.0.0.1:${SERVER_PORT}`, ws: true },
    },
  },
});

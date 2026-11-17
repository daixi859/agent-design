import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** dev 拓扑（ADR-0012）：REST 与 WS 都代理到独立 server 进程。
    端口与 server 同源一参（PI_STUDIO_PORT，默认见 server/main.ts）：
    默认 3141 避开本机代理占用的 3001，否则 vite 起来也代理不通 */
const SERVER_PORT = process.env.PI_STUDIO_PORT ?? "3141";
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": SERVER_ORIGIN,
      "/ws": { target: `ws://127.0.0.1:${SERVER_PORT}`, ws: true },
    },
  },
});

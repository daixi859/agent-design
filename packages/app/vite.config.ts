import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** dev 拓扑（ADR-0012）：REST 与 WS 都代理到独立 server 进程 */
const SERVER_ORIGIN = "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": SERVER_ORIGIN,
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
    },
  },
});

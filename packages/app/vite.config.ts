import { defineConfig, type ViteDevServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createPiDataApi } from "@pi-studio/server";

/** 把 server/pi-data.ts 的只读 API 挂到 dev server 的 /api 前缀下（ADR-0002） */
function piDataApi(): Plugin {
  return {
    name: "pi-data-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api", createPiDataApi());
    },
  };
}

export default defineConfig({
  plugins: [react(), piDataApi()],
});

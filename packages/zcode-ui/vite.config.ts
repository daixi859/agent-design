import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** ZCode 基础组件预览站：纯静态前端，无数据服务，独立端口（3143）避开 app / dsh-ui。 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
});

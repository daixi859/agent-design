import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** dsh-ui 是纯静态预览站：无后端、无代理，独立端口 3142，可与主站 dev 并行 */
export default defineConfig({
  plugins: [react()],
});

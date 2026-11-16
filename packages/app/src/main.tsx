import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles/global.css";

// PWA（ADR 无、Chrome 安装流）：注册 service worker 提供安装条件与离线兜底；
// network-first 策略对 Vite HMR 安全，注册失败静默降级为普通网页
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 无 SW 时浏览器仍可正常使用，仅失去安装与离线能力
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

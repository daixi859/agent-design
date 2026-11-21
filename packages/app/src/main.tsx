import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { bootstrapTransport } from "./state/bootstrap";
import "./styles/global.css";

// 引导（ADR-0019 ④）：浏览器形态注册 service worker（PWA，Chrome 安装流；network-first
// 策略对 Vite HMR 安全，注册失败静默降级为普通网页）；桌面壳内（window.piDesktop 在场）
// 改为接通 IPC 桥与自定义协议取数，并跳过 SW 注册。须在渲染（首载取数）之前跑。
bootstrapTransport();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

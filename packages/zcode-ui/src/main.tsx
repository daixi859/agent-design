import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewApp } from "./preview/PreviewApp";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
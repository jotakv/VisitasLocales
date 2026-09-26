import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "./auth";
import { App } from "./App";
import "./style.css";
registerSW({
  onOfflineReady() {
    window.dispatchEvent(new Event("pwa-ready"));
  },
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

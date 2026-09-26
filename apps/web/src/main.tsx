import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "./auth";
import { App } from "./App";
import "./style.css";
registerSW({
  onOfflineReady() {
    window.dispatchEvent(new Event("pwa-ready"));
  },
});
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
  },
]);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

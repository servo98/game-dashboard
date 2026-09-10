import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import Login from "./pages/Login";
import Pending from "./pages/Pending";
import Status from "./pages/Status";
import { applyMode, readModePreference } from "./theme";
// Fuentes servidas por el propio panel: sin salto a Google Fonts y sin FOUT
// dependiente de la red. Archivo para la interfaz, Plex Mono para todo dato.
import "@fontsource-variable/archivo/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";

// Global error reporting — throttled to 1 per 30s
let lastReport = 0;
function throttledReport(data: {
  message: string;
  stack?: string;
  url?: string;
  component?: string;
}) {
  const now = Date.now();
  if (now - lastReport < 30_000) return;
  lastReport = now;
  api.reportError(data).catch(() => {});
}

window.onerror = (_msg, source, line, col, error) => {
  throttledReport({
    message: error?.message ?? String(_msg),
    stack: error?.stack ?? `${source}:${line}:${col}`,
    url: window.location.href,
    component: "window.onerror",
  });
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;
  throttledReport({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    url: window.location.href,
    component: "unhandledrejection",
  });
};

// El modo guardado se aplica antes del primer pintado, para que las pantallas
// previas al panel (login, invitación, estado) no destellen en el tema contrario.
applyMode(readModePreference());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/invite/:code" element={<Invite />} />
          <Route path="/status" element={<Status />} />
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

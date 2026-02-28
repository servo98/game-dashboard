import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import ErrorBoundary from "./components/ErrorBoundary";
import { api } from "./api";
import "./index.css";

// Global error reporting — throttled to 1 per 30s
let lastReport = 0;
function throttledReport(data: { message: string; stack?: string; url?: string; component?: string }) {
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

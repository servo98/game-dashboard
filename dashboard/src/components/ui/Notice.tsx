import type { ReactNode } from "react";

/**
 * Aviso en línea. Sigue legible a 360px porque el texto envuelve y el filete
 * de color no compite con el acento de la página.
 */
export function Notice({
  tone = "danger",
  children,
  className = "",
}: {
  tone?: "danger" | "warn" | "ok" | "info";
  children: ReactNode;
  className?: string;
}) {
  const skin = {
    danger: "border-danger/35 bg-danger/8 text-danger",
    warn: "border-warn/35 bg-warn/8 text-warn",
    ok: "border-ok/35 bg-ok/8 text-ok",
    info: "border-line bg-raised text-muted",
  }[tone];

  return (
    <div
      className={`rounded-md border px-3 py-2 text-body ${skin} ${className}`}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

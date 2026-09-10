import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./Button";

const WIDTH = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

/**
 * Hoja modal. Entra en 240ms con un desplazamiento corto, se cierra con Escape
 * o pulsando el velo, y bloquea el scroll del fondo mientras esté abierta.
 */
export function Modal({
  title,
  subtitle,
  size = "md",
  onClose,
  children,
  footer,
  toolbar,
  padded = true,
  fill = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof WIDTH;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Acciones que viven en la cabecera, junto al cierre. */
  toolbar?: ReactNode;
  /** A false, el cuerpo no lleva relleno ni scroll: lo gestiona el hijo. */
  padded?: boolean;
  /** Altura fija: para superficies de trabajo que no deben saltar de tamaño. */
  fill?: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);

  // Los padres pasan `onClose={() => setAlgo(null)}`, una flecha nueva en cada
  // render, y el panel re-renderiza sin parar por el stream de estadísticas. Si
  // el efecto dependiera de ella se reejecutaría constantemente y el
  // `focus()` de abajo te sacaría del campo mientras escribes. Por eso la
  // función viaja en una ref y el efecto se monta una sola vez.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="veil-in absolute inset-0 cursor-default bg-bg/70 backdrop-blur-[3px]"
      />
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`sheet-in relative flex w-full ${WIDTH[size]} ${
          fill ? "h-[92vh]" : "max-h-[92vh]"
        } flex-col overflow-hidden rounded-t-xl border border-line bg-surface outline-none sm:rounded-xl`}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-meta text-faint">{subtitle}</p>}
          </div>
          {toolbar}
          <Button tone="ghost" size="sm" icon onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Button>
        </header>

        <div
          className={
            padded ? "min-h-0 flex-1 overflow-y-auto px-4 py-4" : "flex min-h-0 flex-1 flex-col"
          }
        >
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

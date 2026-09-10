import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

/**
 * Armazón de las pantallas anteriores al panel. Sin tarjeta flotante ni sombra:
 * el contenido se apoya en el papel y lo único que lo estructura son filetes.
 * Una sola acción por pantalla.
 */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[22rem]">
        <Wordmark className="mb-8" />
        {children}
        {footer && (
          <>
            <div aria-hidden className="mt-8 h-px bg-line" />
            <div className="mt-3 text-meta text-faint">{footer}</div>
          </>
        )}
      </div>
    </div>
  );
}

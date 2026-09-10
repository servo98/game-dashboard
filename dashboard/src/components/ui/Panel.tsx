import type { ReactNode } from "react";

/**
 * Superficie plana: filete de un píxel, radio 10, cero sombra. Un panel no
 * puede contener otro panel — dentro se usan filetes horizontales, que es lo
 * que evita el efecto de cajas rusas.
 */
export function Panel({
  children,
  className = "",
  rail = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Carril de acento a la izquierda: marca lo que está vivo. */
  rail?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={`relative rounded-lg border bg-surface ${
        rail ? "border-line-strong" : "border-line"
      } ${className}`}
    >
      {rail && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-accent"
        />
      )}
      {children}
    </Tag>
  );
}

/** Filete que separa zonas dentro de un panel, sin abrir otra caja. */
export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-line ${className}`} />;
}

/**
 * Cabecera de sección: etiqueta mono y un filete que se come el resto del
 * ancho. Sustituye al eyebrow en pastilla.
 */
export function SectionRule({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <h2 className="label text-muted shrink-0">{children}</h2>
      <div aria-hidden className="flex-1 h-px bg-line" />
      {right}
    </div>
  );
}

/** Estado vacío: una frase y, como mucho, una salida. */
export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-body text-muted">{title}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Indicador de carga. El anillo que gira es el componente más intercambiable
 * que existe; aquí la espera se dice con palabras, que además informan de qué
 * se está esperando.
 */
export function Loading({
  children = "Cargando",
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={`label tick ${className}`} aria-live="polite">
      {children}
    </p>
  );
}

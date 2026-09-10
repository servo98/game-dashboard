/**
 * Indicador de estado.
 *
 * El punto redondo que late es el tic visual más manido que hay, y encima deja
 * el estado en manos del color: quien no distingue verde de rojo se queda sin
 * dato. Aquí el estado es una barra vertical corta más una etiqueta mono
 * siempre visible, así que el color solo refuerza algo que ya está escrito.
 */

export type Tone = "ok" | "warn" | "danger" | "idle" | "accent";

const BAR: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  idle: "bg-line-strong",
  accent: "bg-accent",
};

const TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  idle: "text-faint",
  accent: "text-accent",
};

export function StatusMark({
  tone,
  label,
  /** Solo para lo que de verdad está cambiando ahora mismo. */
  live = false,
  className = "",
}: {
  tone: Tone;
  label: string;
  live?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden className={`w-[2px] h-3 rounded-full ${BAR[tone]} ${live ? "tick" : ""}`} />
      <span className={`font-mono text-micro uppercase ${TEXT[tone]}`}>{label}</span>
    </span>
  );
}

/** Etiqueta de clasificación: categoría, rol, razón de parada. */
export function Tag({
  children,
  tone = "idle",
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const skin: Record<Tone, string> = {
    ok: "text-ok bg-ok/10 border-ok/25",
    warn: "text-warn bg-warn/10 border-warn/25",
    danger: "text-danger bg-danger/10 border-danger/25",
    idle: "text-muted bg-raised border-line",
    accent: "text-accent bg-accent/10 border-accent/25",
  };
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-micro uppercase ${skin[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

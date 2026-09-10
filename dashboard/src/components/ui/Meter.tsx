import { useEffect, useRef, useState } from "react";

/**
 * Lectura de telemetría. La barra va segmentada a propósito: cuantiza el valor
 * como lo haría un instrumento y se distingue de un progress bar de plantilla.
 * El acento solo cede el sitio cuando el valor entra en zona de aviso.
 */
export function Meter({
  label,
  value,
  max = 100,
  readout,
  warnAt = 70,
  dangerAt = 90,
  className = "",
}: {
  label: string;
  value: number;
  max?: number;
  /** Lo que se lee a la derecha. Si falta, se muestra el porcentaje. */
  readout?: string;
  warnAt?: number;
  dangerAt?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = pct >= dangerAt ? "bg-danger" : pct >= warnAt ? "bg-warn" : "bg-accent";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="label w-8 shrink-0">{label}</span>
      <div className="segmented relative h-[6px] flex-1 overflow-hidden rounded-xs bg-line">
        <div
          className={`h-full ${fill} transition-[width] duration-slow ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="num shrink-0 text-meta text-muted tabular-nums whitespace-nowrap text-right">
        {readout ?? `${pct.toFixed(0)}%`}
      </span>
    </div>
  );
}

/**
 * Historial corto de una métrica. Guarda las últimas muestras del stream y las
 * dibuja; es dato, no adorno, así que solo aparece donde hay stream de verdad.
 */
export function Sparkline({
  value,
  samples = 32,
  className = "",
  title,
}: {
  value: number | null;
  samples?: number;
  className?: string;
  title?: string;
}) {
  const [history, setHistory] = useState<number[]>([]);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || value === last.current) return;
    last.current = value;
    setHistory((prev) => [...prev, value].slice(-samples));
  }, [value, samples]);

  if (history.length < 2) {
    return <div className={`h-5 ${className}`} aria-hidden />;
  }

  const peak = Math.max(1, ...history);
  const step = 100 / (samples - 1);
  const points = history
    .map((v, i) => {
      const x = (i + (samples - history.length)) * step;
      const y = 20 - (v / peak) * 18;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${points.split(" ")[0].split(",")[0]},20 ${points} 100,20`;

  return (
    <svg
      className={`h-5 w-full ${className}`}
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      role="img"
      aria-label={title ?? "Historial"}
    >
      <title>{title ?? "Historial"}</title>
      <polygon points={area} className="fill-accent/15" />
      <polyline
        points={points}
        fill="none"
        className="stroke-accent"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

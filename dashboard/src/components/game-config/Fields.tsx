import { type ReactNode, useState } from "react";
import { EyeIcon, EyeOffIcon } from "../Icons";

/** Controles compartidos por el editor guiado y por el de ficheros .cfg. */

const INPUT_CLASS =
  "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500";

type RowProps = {
  label: string;
  description?: string;
  hint?: ReactNode;
  children: ReactNode;
};

export function FieldRow({ label, description, hint, children }: RowProps) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-200 break-words">{label}</span>
          {hint}
        </div>
        {description && <p className="text-xs text-gray-500 mt-0.5 break-words">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DefaultBadge() {
  return (
    <span className="text-[10px] uppercase tracking-wide text-gray-600 border border-gray-800 rounded px-1 py-px">
      por defecto
    </span>
  );
}

export function ChangedBadge() {
  return (
    <span className="text-[10px] uppercase tracking-wide text-amber-400/90 border border-amber-700/60 rounded px-1 py-px">
      modificado
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
        checked ? "bg-brand-500" : "bg-gray-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export function SelectField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (next: string) => void;
}) {
  // Si el fichero trae un valor que no está en la lista, lo añadimos para no
  // pisárselo en silencio al guardar.
  const known = options.some((o) => o.value === value);
  const all = known ? options : [{ value, label: `${value} (actual)` }, ...options];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT_CLASS} appearance-none cursor-pointer`}
    >
      {all.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
          {opt.description ? ` — ${opt.description}` : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Un slider por sí solo no deja teclear un valor exacto, así que va con su
 * caja numérica al lado.
 */
export function SliderField({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (next: string) => void;
}) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? Math.min(Math.max(numeric, min), max) : min;

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 accent-brand-500 cursor-pointer"
      />
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
        />
        {unit && <span className="text-xs text-gray-600 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

export function TextField({
  value,
  placeholder,
  mono = false,
  type = "text",
  onChange,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  type?: "text" | "password" | "number";
  onChange: (next: string) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT_CLASS} ${mono || type === "number" ? "font-mono" : ""}`}
    />
  );
}

/**
 * Campo para valores secretos (contraseñas, tokens). Va tapado por defecto,
 * con un ojo para descubrirlo: si no, no hay forma de comprobar lo que hay
 * guardado sin borrarlo y volver a escribirlo.
 */
export function SecretField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <input
        type={revealed ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} font-mono pr-10`}
      />
      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-label={revealed ? "Ocultar" : "Mostrar"}
        title={revealed ? "Ocultar" : "Mostrar"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 transition-colors p-1"
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

/**
 * Selector en fila de botones. Para escalas cortas y ordenadas (los world
 * modifiers de Valheim) se lee mucho mejor que un desplegable.
 */
export function SegmentedField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  // Un valor que no está entre las opciones (escrito a mano, o un alias que el
  // juego acepta) se añade como chip extra en vez de quedarse sin seleccionar.
  const known = options.some((o) => o.value === value);
  const all = known ? options : [...options, { value, label: `${value} (actual)` }];

  return (
    <div className="flex flex-wrap gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
      {all.map((opt) => (
        <button
          key={opt.value || "__default"}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 min-w-[4.5rem] px-2 py-1.5 rounded-md text-xs transition-colors ${
            value === opt.value
              ? "bg-brand-500 text-white font-medium"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}

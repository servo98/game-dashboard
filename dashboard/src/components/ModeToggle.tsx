import type { ModePreference } from "../theme";
import { AutoThemeIcon, MoonIcon, SunIcon } from "./Icons";

const OPTIONS: Array<{ id: ModePreference; label: string; Icon: typeof SunIcon }> = [
  { id: "light", label: "Claro", Icon: SunIcon },
  { id: "system", label: "Automático", Icon: AutoThemeIcon },
  { id: "dark", label: "Oscuro", Icon: MoonIcon },
];

/**
 * Tres estados explícitos; "Automático" sigue al sistema y es el de fábrica.
 * Son radios de verdad, así que las flechas del teclado recorren el control
 * sin que haya que reimplementar nada.
 */
export function ModeToggle({
  value,
  onChange,
  className = "",
}: {
  value: ModePreference;
  onChange: (mode: ModePreference) => void;
  className?: string;
}) {
  return (
    <fieldset
      className={`inline-flex items-center gap-0.5 rounded-md border border-line bg-raised p-0.5 ${className}`}
    >
      <legend className="sr-only">Tema</legend>
      {OPTIONS.map(({ id, label, Icon }) => (
        <label
          key={id}
          title={label}
          className={`tap flex h-6 w-7 cursor-pointer items-center justify-center rounded-xs transition-colors
            focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent
            ${value === id ? "bg-surface text-ink" : "text-faint hover:text-muted"}`}
        >
          <input
            type="radio"
            name="panel-theme"
            className="sr-only"
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

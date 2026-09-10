import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/* Un único acabado de campo: fondo elevado, filete, radio 7. El foco lo marca
   el acento en el borde, nunca una sombra de colores. */
const SKIN =
  "w-full rounded-md border border-line bg-raised text-ink placeholder:text-faint " +
  "transition-colors duration-fast ease-out focus:border-accent focus:outline-none " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

/** Etiqueta encima del campo, siempre. Nunca placeholder haciendo de etiqueta. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="text-meta text-faint">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${SKIN} h-8 px-2.5 text-body ${className}`} {...rest} />;
}

/** Para puertos, IDs y todo lo que sea un dato y no una frase. */
export function MonoInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`${SKIN} num h-8 px-2.5 text-body ${className}`}
      spellCheck={false}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${SKIN} h-8 px-2 text-body ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${SKIN} px-2.5 py-2 text-body ${className}`} {...rest} />;
}

export function Checkbox({
  label,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded-xs border border-line-strong bg-raised accent-accent"
        {...rest}
      />
      <label htmlFor={id} className="text-body text-muted cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}

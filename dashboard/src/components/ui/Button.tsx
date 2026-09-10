import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Cuatro pesos y nada más. La jerarquía la marca el peso, no el color: en una
 * fila de acciones solo una puede ser "accent", el resto son "quiet" o "ghost".
 */
export type ButtonTone = "accent" | "quiet" | "ghost" | "danger" | "danger-solid";
export type ButtonSize = "sm" | "md";

const TONE: Record<ButtonTone, string> = {
  accent: "bg-accent text-accent-ink hover:bg-accent/90 border border-transparent",
  quiet: "bg-raised text-ink border border-line hover:border-line-strong",
  ghost: "bg-transparent text-muted border border-transparent hover:text-ink hover:bg-raised",
  danger: "bg-transparent text-danger border border-danger/35 hover:bg-danger/10",
  "danger-solid": "bg-danger text-danger-ink border border-transparent hover:bg-danger/90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-meta gap-1.5",
  md: "h-8 px-3 text-body gap-2",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Solo icono: cuadra la caja y obliga a poner title para el lector. */
  icon?: boolean;
  children?: ReactNode;
};

export function Button({
  tone = "quiet",
  size = "md",
  icon = false,
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`tap inline-flex items-center justify-center rounded-md font-medium leading-none
        disabled:opacity-45 disabled:cursor-not-allowed
        ${TONE[tone]} ${icon ? `${ICON_SIZE[size]} p-0` : SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Enlace con el mismo aspecto que un botón, para descargas y rutas reales. */
export function ButtonLink({
  tone = "quiet",
  size = "md",
  icon = false,
  className = "",
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: boolean;
}) {
  return (
    <a
      className={`tap inline-flex items-center justify-center rounded-md font-medium leading-none no-underline
        ${TONE[tone]} ${icon ? `${ICON_SIZE[size]} p-0` : SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}

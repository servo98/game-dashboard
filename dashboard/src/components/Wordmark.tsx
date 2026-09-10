/**
 * La marca. Un emoji de mando no es una identidad: es el atajo por defecto.
 * Esto es un bastidor de rack dibujado con el mismo trazo que el resto de
 * iconos, así que el logotipo pertenece al mismo juego que la interfaz.
 */
export function Wordmark({
  hostDomain,
  className = "",
}: {
  hostDomain?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-[22px] w-[22px] shrink-0 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        aria-hidden
      >
        <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="3.25" />
        <path d="M7 9h10M7 13h6" />
        <circle cx="16.5" cy="15.5" r="1.15" fill="currentColor" stroke="none" />
      </svg>
      <div className="min-w-0 leading-none">
        <div className="text-title font-semibold tracking-[-0.02em] text-ink">Game Panel</div>
        {hostDomain && (
          <div className="mt-1 truncate font-mono text-micro uppercase text-faint">
            {hostDomain}
          </div>
        )}
      </div>
    </div>
  );
}

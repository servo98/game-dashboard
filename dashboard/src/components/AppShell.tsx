import { type ReactNode, useState } from "react";
import type { User } from "../api";
import type { ModePreference } from "../theme";
import { CloseIcon, LogoutIcon, MenuIcon, PulseIcon } from "./Icons";
import { ModeToggle } from "./ModeToggle";
import { Wordmark } from "./Wordmark";

export type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

type Props = {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  user: User;
  onLogout: () => void;
  onStatus: () => void;
  hostDomain: string;
  mode: ModePreference;
  onModeChange: (mode: ModePreference) => void;
  /** Telemetría del anfitrión, fija al pie de la barra lateral. */
  aside?: ReactNode;
  children: ReactNode;
};

function NavList({
  nav,
  active,
  onNavigate,
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const on = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={on ? "page" : undefined}
            className={`tap relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-body
              ${on ? "bg-raised font-medium text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"}`}
          >
            {on && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent"
              />
            )}
            <span className={on ? "text-accent" : "text-faint"}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function UserBlock({
  user,
  onLogout,
  onStatus,
  mode,
  onModeChange,
}: Pick<Props, "user" | "onLogout" | "onStatus" | "mode" | "onModeChange">) {
  return (
    <div className="flex flex-col gap-2.5">
      <ModeToggle value={mode} onChange={onModeChange} />
      <div className="flex items-center gap-2">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full border border-line"
          />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-raised font-mono text-micro text-muted">
            {user.username.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-meta text-ink">{user.username}</div>
          <div className="font-mono text-micro uppercase text-faint">{user.role}</div>
        </div>
        <button
          type="button"
          onClick={onStatus}
          title="Estado del sistema"
          aria-label="Estado del sistema"
          className="tap grid h-6 w-6 place-items-center rounded-xs text-faint hover:text-ink"
        >
          <PulseIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="tap grid h-6 w-6 place-items-center rounded-xs text-faint hover:text-danger"
        >
          <LogoutIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Armazón del panel: barra lateral fija en escritorio, cajón desplegable por
 * debajo de 1024px. El contenido nunca pasa de 1200px para que las rejillas de
 * datos no se estiren hasta perder la relación entre columnas.
 */
export function AppShell({
  nav,
  active,
  onNavigate,
  user,
  onLogout,
  onStatus,
  hostDomain,
  mode,
  onModeChange,
  aside,
  children,
}: Props) {
  const [drawer, setDrawer] = useState(false);

  // Navegar cierra el cajón; si no, en móvil te quedas mirando el menú.
  const go = (id: string) => {
    setDrawer(false);
    onNavigate(id);
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Barra lateral, escritorio */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Wordmark hostDomain={hostDomain} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
          <NavList nav={nav} active={active} onNavigate={go} />
        </div>
        {aside && <div className="border-t border-line px-4 py-3">{aside}</div>}
        <div className="border-t border-line px-4 py-3">
          <UserBlock
            user={user}
            onLogout={onLogout}
            onStatus={onStatus}
            mode={mode}
            onModeChange={onModeChange}
          />
        </div>
      </aside>

      {/* Barra superior, móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <Wordmark hostDomain={hostDomain} />
        <button
          type="button"
          onClick={() => setDrawer((v) => !v)}
          aria-expanded={drawer}
          aria-label={drawer ? "Cerrar menú" : "Abrir menú"}
          className="tap grid h-8 w-8 place-items-center rounded-md border border-line bg-raised text-muted"
        >
          {drawer ? <CloseIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
        </button>
      </header>

      {drawer && (
        <div className="sticky top-[57px] z-20 border-b border-line bg-surface px-2.5 py-3 lg:hidden">
          <NavList nav={nav} active={active} onNavigate={go} />
          {aside && <div className="mt-3 border-t border-line px-1.5 pt-3">{aside}</div>}
          <div className="mt-3 border-t border-line px-1.5 pt-3">
            <UserBlock
              user={user}
              onLogout={onLogout}
              onStatus={onStatus}
              mode={mode}
              onModeChange={onModeChange}
            />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}

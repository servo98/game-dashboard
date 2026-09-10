import { useEffect, useState } from "react";
import { GamepadIcon } from "../components/Icons";
import { Divider, Meter, Panel, SectionRule, StatusMark, Tag } from "../components/ui";
import { Wordmark } from "../components/Wordmark";

type ServiceHealth = {
  name: string;
  status: "healthy" | "down";
  health: string;
  uptime: string | null;
  restarts: number;
  memUsageMB: number;
  memLimitMB: number;
  cpuPercent: number;
};

type ActiveGame = {
  name: string;
  image: string;
  status: string;
};

type HealthResponse = {
  status: "operational" | "degraded";
  backendUptime: number;
  services: ServiceHealth[];
  activeGames: ActiveGame[];
  timestamp: string;
};

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${secs % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatUptime(isoDate: string): string {
  return formatSeconds(Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
}

const SERVICE_LABELS: Record<string, string> = {
  backend: "API del panel",
  bot: "Bot de Discord",
  dashboard: "Panel web",
  nginx: "Proxy inverso",
  chatpapol: "ChatPapol",
  livekit: "LiveKit (voz y vídeo)",
};

/** Dato suelto de una ficha: etiqueta arriba, valor en mono debajo. */
function Readout({
  label,
  value,
  alarm = false,
}: {
  label: string;
  value: string;
  alarm?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <p className={`num mt-1 text-meta ${alarm ? "text-warn" : "text-ink"}`}>{value}</p>
    </div>
  );
}

export default function Status() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/health/status");
        if (!res.ok) throw new Error();
        const json = (await res.json()) as HealthResponse;
        if (active) {
          setData(json);
          setError(false);
          setLastUpdate(new Date());
        }
      } catch {
        if (active) setError(true);
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const allHealthy = data?.status === "operational";
  // La marca da el estado en una palabra; la frase explica. Decir lo mismo dos
  // veces seguidas es lo que hacía la versión anterior con el titular.
  //
  // Mientras no ha llegado la primera respuesta no hay veredicto que dar:
  // "no operativo" y "todavía no lo sé" no son lo mismo, y esta página es
  // pública, así que anunciar una avería inexistente durante la carga cuesta
  // caro.
  const overall = error
    ? {
        tone: "danger" as const,
        mark: "Sin respuesta",
        line: "No se puede contactar con la API del panel.",
      }
    : !data
      ? {
          tone: "idle" as const,
          mark: "Comprobando",
          line: "Consultando el estado de los servicios.",
        }
      : allHealthy
        ? {
            tone: "ok" as const,
            mark: "Operativo",
            line: "Todos los servicios responden con normalidad.",
          }
        : {
            tone: "warn" as const,
            mark: "Degradado",
            line: "Algún servicio no está respondiendo como debería.",
          };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Wordmark />
          <a
            href="/"
            className="tap rounded-md px-2 py-1 text-meta text-muted no-underline hover:text-ink"
          >
            Ir al panel
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {/* Veredicto: una línea, no una tarjeta de color a pantalla completa */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-hero font-semibold text-ink">Estado del sistema</h1>
            {data && (
              <p className="num text-meta text-faint">
                API en pie desde hace {formatSeconds(data.backendUptime)}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusMark tone={overall.tone} label={overall.mark} live={!error && !allHealthy} />
            <p className="text-body text-muted">{overall.line}</p>
          </div>
        </div>

        {data && (
          <section className="flex flex-col gap-3">
            <SectionRule>Servicios</SectionRule>
            <div className="flex flex-col gap-3">
              {data.services.map((svc) => (
                <Panel key={svc.name} as="article">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <span className="text-title font-semibold text-ink">
                        {SERVICE_LABELS[svc.name] ?? svc.name}
                      </span>
                      <span className="num ml-2 text-micro uppercase text-faint">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag tone={svc.status === "healthy" ? "ok" : "danger"}>{svc.health}</Tag>
                    </div>
                  </div>
                  <Divider />
                  <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                    <Readout
                      label="En pie"
                      value={svc.uptime ? formatUptime(svc.uptime) : "sin dato"}
                    />
                    <Readout label="CPU" value={`${svc.cpuPercent}%`} />
                    <Readout
                      label="RAM"
                      value={`${svc.memUsageMB}MB${svc.memLimitMB > 0 ? ` / ${svc.memLimitMB}MB` : ""}`}
                    />
                    <Readout
                      label="Reinicios"
                      value={String(svc.restarts)}
                      alarm={svc.restarts > 0}
                    />
                  </div>
                  {svc.memLimitMB > 0 && (
                    <>
                      <Divider />
                      <div className="px-4 py-2.5">
                        <Meter
                          label="RAM"
                          value={svc.memUsageMB}
                          max={svc.memLimitMB}
                          readout={`${((svc.memUsageMB / svc.memLimitMB) * 100).toFixed(0)}%`}
                          warnAt={50}
                          dangerAt={80}
                        />
                      </div>
                    </>
                  )}
                </Panel>
              ))}
            </div>
          </section>
        )}

        {data && (
          <section className="flex flex-col gap-3">
            <SectionRule>Servidores de juego</SectionRule>
            {data.activeGames.length > 0 ? (
              <div className="flex flex-col gap-3">
                {data.activeGames.map((game) => (
                  <Panel key={game.name} rail as="article">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-line bg-raised text-faint">
                        <GamepadIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-title font-semibold text-ink">{game.name}</p>
                        <p className="num truncate text-micro text-faint">{game.image}</p>
                      </div>
                      <StatusMark tone="ok" label={game.status} />
                    </div>
                  </Panel>
                ))}
              </div>
            ) : (
              <p className="text-body text-muted">Ningún servidor de juego en marcha.</p>
            )}
          </section>
        )}

        <footer className="border-t border-line pt-4">
          {lastUpdate && (
            <p className="num text-micro text-faint">
              Última lectura {lastUpdate.toLocaleTimeString()} · se refresca cada 10s
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}

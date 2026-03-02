import { useEffect, useState } from "react";

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
  activeGame: ActiveGame | null;
  timestamp: string;
};

function formatUptime(isoDate: string): string {
  const start = new Date(isoDate).getTime();
  const seconds = Math.floor((Date.now() - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${secs % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const SERVICE_LABELS: Record<string, string> = {
  backend: "Backend API",
  bot: "Discord Bot",
  dashboard: "Dashboard",
  nginx: "Reverse Proxy",
};

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎮</span>
            <h1 className="font-semibold text-white">Game Panel Status</h1>
          </div>
          <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
            Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Overall status */}
        <div
          className={`rounded-2xl px-6 py-5 mb-8 border ${
            error
              ? "bg-red-950/30 border-red-800"
              : allHealthy
                ? "bg-green-950/30 border-green-800"
                : "bg-yellow-950/30 border-yellow-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                error
                  ? "bg-red-500"
                  : allHealthy
                    ? "bg-green-500 animate-pulse"
                    : "bg-yellow-500 animate-pulse"
              }`}
            />
            <div>
              <h2 className="text-lg font-semibold text-white">
                {error
                  ? "Unable to reach API"
                  : allHealthy
                    ? "All Systems Operational"
                    : "Degraded Performance"}
              </h2>
              {data && (
                <p className="text-sm text-gray-400 mt-0.5">
                  Backend uptime: {formatSeconds(data.backendUptime)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Services */}
        {data && (
          <div className="space-y-3 mb-8">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Infrastructure Services
            </h3>
            {data.services.map((svc) => (
              <div key={svc.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        svc.status === "healthy" ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <div>
                      <span className="font-medium text-white">
                        {SERVICE_LABELS[svc.name] ?? svc.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">{svc.name}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      svc.status === "healthy"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {svc.health}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Uptime</span>
                    <p className="text-gray-300 font-mono mt-0.5">
                      {svc.uptime ? formatUptime(svc.uptime) : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">CPU</span>
                    <p className="text-gray-300 font-mono mt-0.5">{svc.cpuPercent}%</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Memory</span>
                    <p className="text-gray-300 font-mono mt-0.5">
                      {svc.memUsageMB}MB{svc.memLimitMB > 0 ? ` / ${svc.memLimitMB}MB` : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Restarts</span>
                    <p
                      className={`font-mono mt-0.5 ${svc.restarts > 0 ? "text-yellow-400" : "text-gray-300"}`}
                    >
                      {svc.restarts}
                    </p>
                  </div>
                </div>

                {/* Memory bar */}
                {svc.memLimitMB > 0 && (
                  <div className="mt-2.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        svc.memUsageMB / svc.memLimitMB > 0.8
                          ? "bg-red-500"
                          : svc.memUsageMB / svc.memLimitMB > 0.5
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min((svc.memUsageMB / svc.memLimitMB) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Active game */}
        {data && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Active Game Server
            </h3>
            {data.activeGame ? (
              <div className="bg-gray-900 border border-green-800/50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <span className="font-medium text-white">{data.activeGame.name}</span>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {data.activeGame.image}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{data.activeGame.status}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-500">
                No game server running
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 pt-4 border-t border-gray-800">
          {lastUpdate && (
            <p>Last updated: {lastUpdate.toLocaleTimeString()} — refreshes every 10s</p>
          )}
        </div>
      </main>
    </div>
  );
}

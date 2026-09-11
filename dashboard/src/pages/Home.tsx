import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  createAllServiceStatsStream,
  createLogStream,
  createServiceLogStream,
  type GameServer,
  type ServiceStats,
  type User,
} from "../api";
import { AppShell, type NavItem } from "../components/AppShell";
import BackupsTab from "../components/BackupsTab";
import BotSettings from "../components/BotSettings";
import ConfigEditor from "../components/ConfigEditor";
import FileManager from "../components/FileManager";
import GameStore from "../components/GameStore";
import HostStatsBar from "../components/HostStatsBar";
import {
  BotIcon,
  BoxIcon,
  KeyIcon,
  LogsIcon,
  PlusIcon,
  RestoreIcon,
  ServersIcon,
  SettingsIcon,
  UsersIcon,
} from "../components/Icons";
import LogViewer from "../components/LogViewer";
import McpTokens from "../components/McpTokens";
import PanelSettings from "../components/PanelSettings";
import ServerCard from "../components/ServerCard";
import ServiceStatsBar from "../components/ServiceStatsBar";
import UsersTab from "../components/UsersTab";
import { Button, Divider, Empty, Notice, Panel, SectionRule, StatusMark } from "../components/ui";
import {
  applyAccent,
  applyMode,
  DEFAULT_THEMES,
  type ModePreference,
  readModePreference,
  resolveTheme,
  watchSystemMode,
} from "../theme";

type Tab = "servers" | "bot" | "mcp" | "backups" | "settings" | "users";

const INFRA_SERVICES = ["backend", "bot", "dashboard", "nginx", "chatpapol", "livekit"] as const;
// nginx/dashboard sirven el propio panel → reiniciarlos cortaría esta sesión; sin botón.
const RESTARTABLE_SERVICES = ["backend", "bot", "chatpapol", "livekit"] as const;

const TAB_LABEL: Record<Tab, string> = {
  servers: "Servidores",
  bot: "Bot",
  mcp: "MCP",
  backups: "Copias",
  users: "Usuarios",
  settings: "Ajustes",
};

const TAB_ICON: Record<Tab, React.ReactNode> = {
  servers: <ServersIcon className="h-4 w-4" />,
  bot: <BotIcon className="h-4 w-4" />,
  mcp: <KeyIcon className="h-4 w-4" />,
  backups: <BoxIcon className="h-4 w-4" />,
  users: <UsersIcon className="h-4 w-4" />,
  settings: <SettingsIcon className="h-4 w-4" />,
};

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<{
    title: string;
    factory: () => EventSource;
    serverId?: string;
    dockerImage?: string;
  } | null>(null);
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("servers");
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);
  const [hostMemTotalMB, setHostMemTotalMB] = useState<number | undefined>(undefined);
  const [serviceStats, setServiceStats] = useState<Record<string, ServiceStats>>({});
  const serviceStatsRef = useRef<EventSource | null>(null);
  const [showGameStore, setShowGameStore] = useState(false);
  const [fileManagerId, setFileManagerId] = useState<string | null>(null);
  const [hostDomain, setHostDomain] = useState("aypapol.com");
  const [gameIcons, setGameIcons] = useState<Record<string, string>>({});
  const [sseConnected, setSseConnected] = useState(true);
  const [modePref, setModePref] = useState<ModePreference>(() => readModePreference());

  // Auth guard
  useEffect(() => {
    api
      .me()
      .then((u) => {
        if (u.status === "pending") {
          navigate("/pending", { replace: true });
          return;
        }
        if (u.status === "rejected") {
          navigate("/login?error=rejected", { replace: true });
          return;
        }
        setUser(u);
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);

  // El dominio sale de los ajustes, que se leen sin sesión: una vez al montar
  // basta. Antes dependía de `user` sin usarlo, así que se repetía en cada
  // cambio de sesión sin motivo.
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setHostDomain(s.host_domain))
      .catch(() => {});
  }, []);

  // Fetch game catalog for icons
  useEffect(() => {
    api
      .getCatalog()
      .then((catalog) => {
        const map: Record<string, string> = {};
        for (const t of catalog) {
          if (t.icon) map[t.id] = t.icon;
        }
        setGameIcons(map);
      })
      .catch(() => {});
  }, []);

  const serversRef = useRef(servers);
  serversRef.current = servers;

  const fetchServers = useCallback(async () => {
    try {
      const list = await api.listServers();
      setServers(list);
      setError(null);
    } catch {
      if (serversRef.current.length === 0) setError("No se pudo cargar la lista de servidores.");
    }
  }, []);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  // Multiplexed service stats SSE (admin only)
  useEffect(() => {
    if (user?.role !== "admin") return;

    const es = createAllServiceStatsStream();
    serviceStatsRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ServiceStats;
        if (data.service) {
          setServiceStats((prev) => ({ ...prev, [data.service]: data }));
        }
        setSseConnected(true);
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setSseConnected(false);
    };

    return () => es.close();
  }, [user?.role]);

  const handleStart = useCallback(
    async (id: string) => {
      setLoadingId(id);
      setError(null);
      try {
        await api.startServer(id);
        await fetchServers();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingId(null);
      }
    },
    [fetchServers],
  );

  const handleStop = useCallback(
    async (id: string) => {
      setLoadingId(id);
      setError(null);
      try {
        await api.stopServer(id);
        await fetchServers();
        setLogTarget(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingId(null);
      }
    },
    [fetchServers],
  );

  /**
   * Reinstala el juego desde Steam. Tarda minutos (baja un par de gigas), así
   * que lleva su propio indicador en vez del de arrancar/parar: la tarjeta
   * tiene que seguir contando qué pasa mientras tanto.
   */
  const handleForceUpdate = useCallback(
    async (id: string) => {
      setUpdatingId(id);
      setError(null);
      try {
        await api.forceUpdateServer(id);
        await fetchServers();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUpdatingId(null);
      }
    },
    [fetchServers],
  );

  const handleDelete = useCallback(
    async (id: string, deleteFiles: boolean) => {
      setError(null);
      try {
        await api.deleteServer(id, deleteFiles);
        await fetchServers();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [fetchServers],
  );

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  const handleRestartService = async (name: (typeof RESTARTABLE_SERVICES)[number]) => {
    setRestartingService(name);
    setRestartMsg(null);
    setError(null);
    try {
      const res = await api.restartService(name);
      setRestartMsg(res.message);
      setTimeout(() => setRestartMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestartingService(null);
    }
  };

  const handleViewLogs = useCallback((id: string) => {
    const server = serversRef.current.find((s) => s.id === id);
    setLogTarget({
      title: server?.name ?? id,
      factory: () => createLogStream(id),
      serverId: id,
      dockerImage: server?.docker_image,
    });
  }, []);

  const handleEditConfig = useCallback((id: string) => {
    setEditConfigId(id);
  }, []);

  const handleOpenFiles = useCallback((id: string) => {
    setFileManagerId(id);
  }, []);

  const sortedServers = useMemo(
    () =>
      [...servers].sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (a.status !== "running" && b.status === "running") return 1;
        return 0;
      }),
    [servers],
  );

  // Varios servidores pueden estar corriendo a la vez
  const runningServers = useMemo(() => servers.filter((s) => s.status === "running"), [servers]);
  // El "primario" (primero corriendo) define el tema/banner
  const primaryServer = runningServers[0] ?? null;
  const isAdmin = user?.role === "admin";
  const editConfigServer = editConfigId ? servers.find((s) => s.id === editConfigId) : null;

  const currentTheme = useMemo(
    () =>
      primaryServer
        ? resolveTheme(primaryServer.game_type, {
            banner_path: primaryServer.banner_path,
            accent_color: primaryServer.accent_color,
          })
        : DEFAULT_THEMES._idle,
    [primaryServer],
  );

  // El acento se recalibra contra el fondo del modo activo, no se aplica crudo.
  useEffect(() => {
    const mode = applyMode(modePref);
    applyAccent(currentTheme.accent, mode);
  }, [currentTheme, modePref]);

  // Si el modo es automático, seguir al sistema cuando cambie de tema.
  useEffect(() => {
    if (modePref !== "system") return;
    return watchSystemMode((mode) => applyAccent(currentTheme.accent, mode));
  }, [modePref, currentTheme]);

  const nav: NavItem[] = useMemo(() => {
    const ids: Tab[] = isAdmin
      ? ["servers", "bot", "mcp", "backups", "users", "settings"]
      : ["servers"];
    return ids.map((id) => ({ id, label: TAB_LABEL[id], icon: TAB_ICON[id] }));
  }, [isAdmin]);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="label tick">Cargando panel</p>
      </div>
    );
  }

  return (
    <AppShell
      nav={nav}
      active={tab}
      onNavigate={(id) => setTab(id as Tab)}
      user={user}
      onLogout={handleLogout}
      onStatus={() => navigate("/status")}
      hostDomain={hostDomain}
      mode={modePref}
      onModeChange={setModePref}
      aside={isAdmin ? <HostStatsBar onMemTotal={setHostMemTotalMB} /> : undefined}
    >
      <div className="flex flex-col gap-5">
        {/* Cabecera de sección */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-display font-semibold text-ink">{TAB_LABEL[tab]}</h1>
          {tab === "servers" && isAdmin && (
            <Button tone="accent" onClick={() => setShowGameStore(true)}>
              <PlusIcon className="h-3.5 w-3.5" />
              Añadir juego
            </Button>
          )}
        </div>

        {!sseConnected && (
          <Notice tone="warn">
            <span className="tick">Sin lecturas en vivo.</span> Reintentando conexión.
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {restartMsg && <Notice tone="ok">{restartMsg}</Notice>}

        {tab === "servers" && (
          <>
            <section className="flex flex-col gap-3">
              <SectionRule
                right={
                  <span className="num shrink-0 text-micro text-faint">
                    {runningServers.length}/{servers.length}
                  </span>
                }
              >
                Servidores
              </SectionRule>

              {servers.length === 0 ? (
                <Empty
                  title={
                    isAdmin
                      ? "Todavía no hay ningún servidor configurado."
                      : "No tienes servidores asignados. Pide acceso a un administrador."
                  }
                  action={
                    isAdmin ? (
                      <Button tone="accent" onClick={() => setShowGameStore(true)}>
                        <PlusIcon className="h-3.5 w-3.5" />
                        Añadir el primero
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                  {sortedServers.map((server, i) => (
                    <div
                      key={server.id}
                      className="row-in"
                      style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
                    >
                      <ServerCard
                        server={server}
                        isActive={server.status === "running"}
                        loading={loadingId === server.id}
                        updating={updatingId === server.id}
                        hostMemTotalMB={hostMemTotalMB}
                        hostDomain={hostDomain}
                        iconUrl={server.icon || gameIcons[server.id]}
                        banner={
                          resolveTheme(server.game_type, { banner_path: server.banner_path }).banner
                        }
                        isAdmin={isAdmin}
                        onStart={handleStart}
                        onStop={handleStop}
                        onDelete={handleDelete}
                        onViewLogs={handleViewLogs}
                        onEditConfig={handleEditConfig}
                        onOpenFiles={handleOpenFiles}
                        onForceUpdate={handleForceUpdate}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {isAdmin && (
              <section className="flex flex-col gap-3">
                <SectionRule>Infraestructura</SectionRule>
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {INFRA_SERVICES.map((svc) => {
                    const stats = serviceStats[svc] ?? null;
                    return (
                      <Panel key={svc} className="flex flex-col" as="article">
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="text-body font-medium text-ink">{svc}</span>
                          <StatusMark
                            tone={stats ? "ok" : "idle"}
                            label={stats ? "Activo" : "Sin dato"}
                          />
                        </div>
                        <Divider />
                        <div className="px-3.5 py-2.5">
                          <ServiceStatsBar stats={stats} />
                        </div>
                        <Divider />
                        <div className="flex items-center gap-1 px-3.5 py-2">
                          <Button
                            tone="ghost"
                            size="sm"
                            onClick={() =>
                              setLogTarget({
                                title: svc,
                                factory: () => createServiceLogStream(svc),
                              })
                            }
                          >
                            <LogsIcon className="h-3.5 w-3.5" />
                            Registro
                          </Button>
                          {(RESTARTABLE_SERVICES as readonly string[]).includes(svc) && (
                            <Button
                              tone="ghost"
                              size="sm"
                              onClick={() =>
                                handleRestartService(svc as (typeof RESTARTABLE_SERVICES)[number])
                              }
                              disabled={restartingService === svc}
                            >
                              <RestoreIcon className="h-3.5 w-3.5" />
                              {restartingService === svc ? "Reiniciando" : "Reiniciar"}
                            </Button>
                          )}
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "bot" && (
          <div className="max-w-xl">
            <BotSettings />
          </div>
        )}

        {tab === "mcp" && (
          <div className="max-w-xl">
            <McpTokens />
          </div>
        )}

        {tab === "backups" && <BackupsTab servers={servers} />}

        {tab === "users" && <UsersTab />}

        {tab === "settings" && (
          <div className="max-w-xl">
            <PanelSettings />
          </div>
        )}
      </div>

      {logTarget && (
        <LogViewer
          title={logTarget.title}
          streamFactory={logTarget.factory}
          onClose={() => setLogTarget(null)}
          serverId={logTarget.serverId}
          dockerImage={logTarget.dockerImage}
        />
      )}

      {editConfigId && editConfigServer && (
        <ConfigEditor
          serverId={editConfigId}
          serverName={editConfigServer.name}
          gameType={editConfigServer.game_type}
          open={!!editConfigId}
          isRunning={editConfigServer.status === "running"}
          onClose={() => setEditConfigId(null)}
          onSaved={fetchServers}
        />
      )}

      {fileManagerId && (
        <FileManager
          serverId={fileManagerId}
          serverName={servers.find((s) => s.id === fileManagerId)?.name ?? fileManagerId}
          onClose={() => setFileManagerId(null)}
        />
      )}

      <GameStore
        open={showGameStore}
        onClose={() => setShowGameStore(false)}
        onCreated={fetchServers}
      />
    </AppShell>
  );
}

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, type GameServer, type User } from "../api";
import ServerCard from "../components/ServerCard";
import LogViewer from "../components/LogViewer";
import ConfigEditor from "../components/ConfigEditor";
import BotSettings from "../components/BotSettings";

type Tab = "servers" | "bot";

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [logServerId, setLogServerId] = useState<string | null>(null);
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("servers");
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);

  const fetchServers = useCallback(async () => {
    try {
      const list = await api.listServers();
      setServers(list);
      setError(null);
    } catch {
      // Only show if we have no data yet (first load)
      if (servers.length === 0) setError("Failed to load servers");
    }
  }, [servers.length]);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const handleStart = async (id: string) => {
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
  };

  const handleStop = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      await api.stopServer(id);
      await fetchServers();
      if (logServerId === id) setLogServerId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };

  const handleRestartService = async (name: "backend" | "bot") => {
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

  const activeServer = servers.find((s) => s.status === "running") ?? null;
  const editConfigServer = editConfigId ? servers.find((s) => s.id === editConfigId) : null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Navbar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-white">
            <span className="text-xl">🎮</span> Game Panel
          </div>
          <div className="flex items-center gap-3">
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full border border-gray-700"
              />
            )}
            <span className="text-sm text-gray-300">{user.username}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Active server banner */}
        {activeServer && (
          <div className="mb-6 bg-green-950/40 border border-green-800 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-green-300 font-medium">
                {activeServer.name} is running on port {activeServer.port}
              </span>
            </div>
            <button
              onClick={() => handleStop(activeServer.id)}
              disabled={loadingId === activeServer.id}
              className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              {loadingId === activeServer.id ? "Stopping..." : "Stop"}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {(["servers", "bot"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-brand-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "servers" ? "Game Servers" : "Bot"}
            </button>
          ))}
        </div>

        {tab === "servers" && (
          <>
            {/* Server grid */}
            {servers.length === 0 ? (
              <div className="text-center text-gray-600 py-16">No servers configured.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    isActive={server.status === "running"}
                    loading={loadingId === server.id}
                    onStart={() => handleStart(server.id)}
                    onStop={() => handleStop(server.id)}
                    onViewLogs={() => setLogServerId(server.id)}
                    onEditConfig={() => setEditConfigId(server.id)}
                  />
                ))}
              </div>
            )}

            {/* Infrastructure */}
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">Infrastructure</h2>
              <div className="flex flex-wrap gap-3">
                {(["backend", "bot"] as const).map((svc) => (
                  <button
                    key={svc}
                    onClick={() => handleRestartService(svc)}
                    disabled={restartingService === svc}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-sm text-gray-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                  >
                    <span
                      className={
                        restartingService === svc ? "inline-block animate-spin" : ""
                      }
                    >
                      ⟳
                    </span>
                    {restartingService === svc
                      ? `Restarting ${svc}...`
                      : `Restart ${svc}`}
                  </button>
                ))}
              </div>
              {restartMsg && (
                <p className="mt-2 text-xs text-green-400">{restartMsg}</p>
              )}
            </div>
          </>
        )}

        {tab === "bot" && (
          <div className="max-w-lg">
            <BotSettings />
          </div>
        )}
      </main>

      {/* Log viewer modal */}
      {logServerId && (
        <LogViewer serverId={logServerId} onClose={() => setLogServerId(null)} />
      )}

      {/* Config editor modal */}
      {editConfigId && editConfigServer && (
        <ConfigEditor
          serverId={editConfigId}
          serverName={editConfigServer.name}
          open={!!editConfigId}
          onClose={() => setEditConfigId(null)}
          onSaved={fetchServers}
        />
      )}
    </div>
  );
}

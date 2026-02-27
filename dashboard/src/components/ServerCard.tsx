import { useState } from "react";
import type { GameServer, ServerSessionRecord } from "../api";
import { api } from "../api";
import StatsBar from "./StatsBar";

type Props = {
  server: GameServer;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onViewLogs: () => void;
  onEditConfig: () => void;
  loading: boolean;
};

const GAME_ICONS: Record<string, string> = {
  minecraft: "⛏️",
  valheim: "🪓",
};

const STATUS_COLOR: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-500",
  missing: "bg-gray-700",
};

const GAME_HOST: Record<string, (port: number) => string> = {
  minecraft: () => "mc.aypapol.com",
};

function connectAddress(game_type: string, port: number): string {
  const fn = GAME_HOST[game_type];
  return fn ? fn(port) : `aypapol.com:${port}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const REASON_LABEL: Record<string, string> = {
  user: "Stopped",
  crash: "Crashed",
  replaced: "Replaced",
};

export default function ServerCard({
  server,
  isActive,
  onStart,
  onStop,
  onViewLogs,
  onEditConfig,
  loading,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ServerSessionRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const icon = GAME_ICONS[server.game_type] ?? "🎮";
  const isRunning = server.status === "running";
  const address = connectAddress(server.game_type, server.port);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (history === null) {
      setHistoryLoading(true);
      try {
        const rows = await api.getServerHistory(server.id);
        setHistory(rows);
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    }
  }

  return (
    <div
      className={`bg-gray-900 border rounded-2xl p-5 flex flex-col gap-4 transition-all ${
        isActive ? "border-brand-500 shadow-lg shadow-brand-500/10" : "border-gray-800"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <h3 className="font-semibold text-white leading-tight">{server.name}</h3>
            <p className="text-xs text-gray-500">Port {server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLOR[server.status]}`}
          />
          <span className="text-xs text-gray-400 capitalize">{server.status}</span>
        </div>
      </div>

      {/* Connect address — only when running */}
      {isRunning && (
        <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 leading-none mb-0.5">Conectar</span>
            <span className="text-sm font-mono text-green-400">{address}</span>
          </div>
          <button
            onClick={handleCopy}
            className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors shrink-0"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
      )}

      {/* CPU/RAM stats — only when running */}
      {isRunning && <StatsBar serverId={server.id} />}

      {/* Actions */}
      <div className="flex gap-2">
        {!isRunning ? (
          <>
            <button
              onClick={onStart}
              disabled={loading}
              className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2 text-sm font-medium transition-colors"
            >
              {loading ? "Starting..." : "Start"}
            </button>
            <button
              onClick={onEditConfig}
              title="Edit config"
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-400 hover:text-white transition-colors"
            >
              ⚙
            </button>
          </>
        ) : (
          <button
            onClick={onStop}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2 text-sm font-medium transition-colors"
          >
            {loading ? "Stopping..." : "Stop"}
          </button>
        )}
        {isRunning && (
          <button
            onClick={onViewLogs}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-300 transition-colors"
          >
            Logs
          </button>
        )}
        <button
          onClick={toggleHistory}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-400 hover:text-gray-300 transition-colors"
          title="Session history"
        >
          ⏱
        </button>
      </div>

      {/* Session history panel */}
      {showHistory && (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Recent Sessions</p>
          {historyLoading ? (
            <div className="text-xs text-gray-600 animate-pulse">Loading...</div>
          ) : history && history.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {history.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-xs text-gray-400"
                >
                  <span>
                    {new Date(s.started_at * 1000).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    {s.duration_seconds !== null && (
                      <span className="text-gray-500">
                        {formatDuration(s.duration_seconds)}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        s.stop_reason === "crash"
                          ? "bg-red-950/50 text-red-400"
                          : s.stop_reason === "replaced"
                          ? "bg-yellow-950/50 text-yellow-500"
                          : s.stop_reason
                          ? "bg-gray-800 text-gray-500"
                          : "bg-green-950/50 text-green-500"
                      }`}
                    >
                      {s.stop_reason ? REASON_LABEL[s.stop_reason] ?? s.stop_reason : "Running"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No sessions recorded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

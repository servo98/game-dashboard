import { useState } from "react";
import type { BackupRecord, GameServer, ServerSessionRecord } from "../api";
import { api } from "../api";
import { connectAddress, formatDuration, formatSize } from "../utils/format";
import StatsBar from "./StatsBar";

type Props = {
  server: GameServer;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onViewLogs: () => void;
  onEditConfig: () => void;
  onDelete: () => void;
  loading: boolean;
  hostMemTotalMB?: number;
  hostDomain?: string;
};

const STATUS_COLOR: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-500",
  missing: "bg-gray-500",
};

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
  onDelete,
  loading,
  hostMemTotalMB,
  hostDomain = "aypapol.com",
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ServerSessionRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[] | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const isRunning = server.status === "running";
  const address = connectAddress(server.game_type, server.port, hostDomain);

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

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  async function toggleBackups() {
    if (showBackups) {
      setShowBackups(false);
      return;
    }
    setShowBackups(true);
    if (backups === null) {
      setBackupsLoading(true);
      try {
        const rows = await api.listBackups(server.id);
        setBackups(rows);
      } catch {
        setBackups([]);
      } finally {
        setBackupsLoading(false);
      }
    }
  }

  async function handleCreateBackup() {
    setBackupCreating(true);
    try {
      const record = await api.createBackup(server.id);
      setBackups((prev) => (prev ? [record, ...prev] : [record]));
    } catch {
      // ignore
    } finally {
      setBackupCreating(false);
    }
  }

  async function handleDeleteBackup(backupId: number) {
    try {
      await api.deleteBackup(server.id, backupId);
      setBackups((prev) => prev?.filter((b) => b.id !== backupId) ?? null);
    } catch {
      // ignore
    }
  }

  async function handleRestoreBackup(backupId: number) {
    if (confirmRestore === backupId) {
      try {
        await api.restoreBackup(server.id, backupId);
      } catch {
        // ignore
      }
      setConfirmRestore(null);
    } else {
      setConfirmRestore(backupId);
      setTimeout(() => setConfirmRestore(null), 3000);
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
          <span className="text-3xl">🎮</span>
          <div>
            <h3 className="font-semibold text-white leading-tight">{server.name}</h3>
            <p className="text-xs text-gray-500">Port {server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLOR[server.status]}`}
          />
          <span className="text-xs text-gray-400 capitalize">
            {server.status === "missing" ? "Stopped" : server.status}
          </span>
        </div>
      </div>

      {/* Connect address — only when running */}
      {isRunning && (
        <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 leading-none mb-0.5">Connect</span>
            <span className="text-sm font-mono text-green-400">{address}</span>
          </div>
          <button
            onClick={handleCopy}
            className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors shrink-0"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {/* CPU/RAM stats — only when running */}
      {isRunning && <StatsBar serverId={server.id} hostMemTotalMB={hostMemTotalMB} />}

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
            <button
              onClick={handleDeleteClick}
              title={confirmDelete ? "Click again to confirm" : "Delete server"}
              className={`px-3 py-2 rounded-xl text-sm transition-colors ${
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400"
              }`}
            >
              {confirmDelete ? "Confirm?" : "🗑"}
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
          onClick={toggleBackups}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-400 hover:text-gray-300 transition-colors"
          title="Backups"
        >
          📦
        </button>
        <button
          onClick={toggleHistory}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-400 hover:text-gray-300 transition-colors"
          title="Session history"
        >
          ⏱
        </button>
      </div>

      {/* Backups panel */}
      {showBackups && (
        <div className="border-t border-gray-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Backups</p>
            <button
              onClick={handleCreateBackup}
              disabled={backupCreating}
              className="text-xs px-2.5 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {backupCreating ? "Creating..." : "Create Backup"}
            </button>
          </div>
          {backupsLoading ? (
            <div className="text-xs text-gray-600 animate-pulse">Loading...</div>
          ) : backups && backups.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex flex-col">
                    <span>
                      {new Date(b.created_at * 1000).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-gray-600">{formatSize(b.size_bytes)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={api.downloadBackupUrl(server.id, b.id)}
                      className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                      title="Download"
                    >
                      ⬇
                    </a>
                    <button
                      onClick={() => handleRestoreBackup(b.id)}
                      disabled={isRunning}
                      title={isRunning ? "Stop server first" : "Restore"}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        confirmRestore === b.id
                          ? "bg-yellow-600 text-white hover:bg-yellow-700"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      {confirmRestore === b.id ? "Confirm?" : "↩"}
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(b.id)}
                      className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No backups yet.</p>
          )}
        </div>
      )}

      {/* Session history panel */}
      {showHistory && (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Recent Sessions</p>
          {historyLoading ? (
            <div className="text-xs text-gray-600 animate-pulse">Loading...</div>
          ) : history && history.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {history.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs text-gray-400">
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
                      <span className="text-gray-500">{formatDuration(s.duration_seconds)}</span>
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
                      {s.stop_reason ? (REASON_LABEL[s.stop_reason] ?? s.stop_reason) : "Running"}
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

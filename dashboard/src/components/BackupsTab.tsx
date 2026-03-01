import { useEffect, useState } from "react";
import { api, type BackupRecord, type GameServer } from "../api";
import { formatSize } from "../utils/format";

type Props = {
  servers: GameServer[];
};

export default function BackupsTab({ servers }: Props) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serverMap = Object.fromEntries(servers.map((s) => [s.id, s]));

  async function fetchBackups() {
    try {
      const data = await api.listAllBackups();
      setBackups(data);
      setError(null);
    } catch {
      setError("Failed to load backups");
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    fetchBackups();
  }, []);

  async function handleRestore(backup: BackupRecord) {
    if (confirmRestore === backup.id) {
      try {
        await api.restoreBackup(backup.server_id, backup.id);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
      setConfirmRestore(null);
    } else {
      setConfirmRestore(backup.id);
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  }

  async function handleDelete(backup: BackupRecord) {
    if (confirmDelete === backup.id) {
      try {
        await api.deleteBackup(backup.server_id, backup.id);
        setBackups((prev) => prev.filter((b) => b.id !== backup.id));
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
      setConfirmDelete(null);
    } else {
      setConfirmDelete(backup.id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  // Group backups by server
  const grouped = backups.reduce<Record<string, BackupRecord[]>>((acc, b) => {
    (acc[b.server_id] ??= []).push(b);
    return acc;
  }, {});

  const totalSize = backups.reduce((sum, b) => sum + b.size_bytes, 0);

  if (loading) {
    return (
      <div className="text-sm text-gray-500 animate-pulse py-8 text-center">Loading backups...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {backups.length} backup{backups.length !== 1 ? "s" : ""} &middot; {formatSize(totalSize)}{" "}
          total
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {backups.length === 0 ? (
        <div className="text-center text-gray-600 py-12">
          No backups yet. Create backups from each game server's card.
        </div>
      ) : (
        Object.entries(grouped).map(([serverId, serverBackups]) => {
          const server = serverMap[serverId];
          const isRunning = server?.status === "running";

          return (
            <div
              key={serverId}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              {/* Server header */}
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎮</span>
                  <span className="text-sm font-medium text-white">{server?.name ?? serverId}</span>
                  {server && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        isRunning ? "bg-green-500" : "bg-gray-500"
                      }`}
                    />
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {serverBackups.length} backup{serverBackups.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Backup rows */}
              <div className="divide-y divide-gray-800/50">
                {serverBackups.map((b) => (
                  <div
                    key={b.id}
                    className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-300">
                        {new Date(b.created_at * 1000).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-xs text-gray-600">{formatSize(b.size_bytes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={api.downloadBackupUrl(serverId, b.id)}
                        className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-colors"
                        title="Download"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => handleRestore(b)}
                        disabled={isRunning}
                        title={isRunning ? "Stop server first" : "Restore this backup"}
                        className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                          confirmRestore === b.id
                            ? "bg-yellow-600 text-white hover:bg-yellow-700"
                            : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        }`}
                      >
                        {confirmRestore === b.id ? "Confirm?" : "Restore"}
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                          confirmDelete === b.id
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400"
                        }`}
                        title="Delete"
                      >
                        {confirmDelete === b.id ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

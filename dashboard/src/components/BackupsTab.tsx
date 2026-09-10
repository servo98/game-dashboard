import { useEffect, useMemo, useState } from "react";
import { api, type BackupRecord, type GameServer, type PanelSettings } from "../api";
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
  const [settings, setSettings] = useState<PanelSettings | null>(null);

  const serverMap = useMemo(() => Object.fromEntries(servers.map((s) => [s.id, s])), [servers]);

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
    api
      .getSettings()
      .then(setSettings)
      .catch(() => {});
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
  const grouped = useMemo(
    () =>
      backups.reduce<Record<string, BackupRecord[]>>((acc, b) => {
        (acc[b.server_id] ??= []).push(b);
        return acc;
      }, {}),
    [backups],
  );

  const totalSize = useMemo(() => backups.reduce((sum, b) => sum + b.size_bytes, 0), [backups]);

  if (loading) {
    return <div className="text-body text-faint tick py-8 text-center">Cargando copias</div>;
  }

  const autoBackupHours = settings ? Number(settings.auto_backup_interval_hours) : 0;
  const maxPerServer = settings ? Number(settings.max_backups_per_server) : 0;

  return (
    <div className="space-y-6">
      {/* Auto-backup config summary */}
      {settings && (
        <div className="bg-surface border border-line rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${autoBackupHours > 0 ? "bg-ok" : "bg-line-strong"}`}
              />
              <span className="text-body text-muted">
                Auto-backup: {autoBackupHours > 0 ? `every ${autoBackupHours}h` : "disabled"}
              </span>
            </div>
            <span className="text-body text-faint">|</span>
            <span className="text-body text-muted">Max {maxPerServer} per server</span>
          </div>
          <span className="text-meta text-faint">Se cambia en Ajustes</span>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-body text-muted">
          {backups.length} backup{backups.length !== 1 ? "s" : ""} &middot; {formatSize(totalSize)}{" "}
          total
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/35 rounded-md px-4 py-3 text-body text-danger">
          {error}
        </div>
      )}

      {backups.length === 0 ? (
        <div className="text-center text-faint py-12">
          No backups yet. Create backups from each game server's card.
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => {
            const aRunning = serverMap[a]?.status === "running" ? 1 : 0;
            const bRunning = serverMap[b]?.status === "running" ? 1 : 0;
            return bRunning - aRunning;
          })
          .map(([serverId, serverBackups]) => {
            const server = serverMap[serverId];
            const isRunning = server?.status === "running";

            return (
              <div
                key={serverId}
                className={`bg-surface border rounded-lg overflow-hidden ${
                  isRunning ? "border-ok/60" : "border-line"
                }`}
              >
                {/* Server header */}
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-title">🎮</span>
                    <span className="text-body font-medium text-ink">
                      {server?.name ?? serverId}
                    </span>
                    {server && (
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          isRunning ? "bg-ok" : "bg-line-strong"
                        }`}
                      />
                    )}
                  </div>
                  <span className="text-meta text-faint">
                    {serverBackups.length} backup{serverBackups.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Backup rows */}
                <div className="divide-y divide-line/50">
                  {serverBackups.map((b) => (
                    <div
                      key={b.id}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-raised/30 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="text-body text-muted">
                          {new Date(b.created_at * 1000).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-meta text-faint">{formatSize(b.size_bytes)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={api.downloadBackupUrl(serverId, b.id)}
                          className="tap px-2 py-1 rounded-md bg-raised hover:bg-line text-meta text-muted hover:text-ink transition-colors"
                          title="Descargar"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => handleRestore(b)}
                          disabled={isRunning}
                          title={isRunning ? "Stop server first" : "Restore this backup"}
                          className={`tap px-2 py-1 rounded-md text-meta transition-colors ${
                            confirmRestore === b.id
                              ? "bg-warn text-warn-ink hover:bg-warn/90"
                              : "bg-raised hover:bg-line text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
                          }`}
                        >
                          {confirmRestore === b.id ? "Confirm?" : "Restore"}
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          className={`tap px-2 py-1 rounded-md text-meta transition-colors ${
                            confirmDelete === b.id
                              ? "bg-danger text-danger-ink hover:bg-danger/90"
                              : "bg-raised hover:bg-line text-muted hover:text-danger"
                          }`}
                          title="Borrar"
                        >
                          {confirmDelete === b.id ? "Confirm?" : "Borrar"}
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

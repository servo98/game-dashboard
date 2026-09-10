import { memo, useState } from "react";
import type { BackupRecord, GameServer, ServerSessionRecord } from "../api";
import { api } from "../api";
import { connectAddress, formatDuration, formatSize } from "../utils/format";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  GamepadIcon,
  LogsIcon,
  PlayIcon,
  RestoreIcon,
  SettingsIcon,
  StopIcon,
  TrashIcon,
} from "./Icons";
import OnlinePlayers from "./OnlinePlayers";
import StatsBar from "./StatsBar";
import { Button, ButtonLink, Divider, Panel, StatusMark, Tag, type Tone } from "./ui";

type Props = {
  server: GameServer;
  isActive: boolean;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onViewLogs: (id: string) => void;
  onEditConfig: (id: string) => void;
  onOpenFiles: (id: string) => void;
  onDelete: (id: string, deleteFiles: boolean) => void;
  loading: boolean;
  hostMemTotalMB?: number;
  hostDomain?: string;
  iconUrl?: string;
  /** Arte del juego. Va detrás de la cabecera, no como héroe de página. */
  banner?: string;
  isAdmin?: boolean;
};

/** El estado se dice con palabras; el color solo lo subraya. */
const STATUS: Record<string, { tone: Tone; label: string; live?: boolean }> = {
  running: { tone: "ok", label: "En marcha" },
  joinable: { tone: "ok", label: "Listo" },
  starting: { tone: "warn", label: "Arrancando", live: true },
  stopped: { tone: "idle", label: "Parado" },
  missing: { tone: "idle", label: "Parado" },
};

const STOP_REASON: Record<string, { tone: Tone; label: string }> = {
  user: { tone: "idle", label: "Parado" },
  crash: { tone: "danger", label: "Caída" },
  replaced: { tone: "warn", label: "Reemplazado" },
};

/** Fila de un desplegable: dos columnas, mono a la izquierda, acciones a la derecha. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1">{children}</div>;
}

export default memo(function ServerCard({
  server,
  isActive,
  onStart,
  onStop,
  onViewLogs,
  onEditConfig,
  onOpenFiles,
  onDelete,
  loading,
  hostMemTotalMB,
  hostDomain = "aypapol.com",
  iconUrl,
  banner,
  isAdmin = true,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [drawer, setDrawer] = useState<"backups" | "history" | null>(null);
  const [history, setHistory] = useState<ServerSessionRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[] | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const isRunning = server.status === "running";
  const effectiveStatus = isRunning && server.joinable ? server.joinable : server.status;
  const status = STATUS[effectiveStatus] ?? STATUS.stopped;
  const address = connectAddress(server.port, hostDomain);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function openDrawer(which: "backups" | "history") {
    if (drawer === which) {
      setDrawer(null);
      return;
    }
    setDrawer(which);

    if (which === "history" && history === null) {
      setHistoryLoading(true);
      try {
        setHistory(await api.getServerHistory(server.id));
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    }

    if (which === "backups" && backups === null) {
      setBackupsLoading(true);
      try {
        setBackups(await api.listBackups(server.id));
      } catch {
        setBackups([]);
      } finally {
        setBackupsLoading(false);
      }
    }
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete(server.id, true);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
    }
  }

  async function handleCreateBackup() {
    setBackupCreating(true);
    try {
      const record = await api.createBackup(server.id);
      setBackups((prev) => (prev ? [record, ...prev] : [record]));
    } catch {
      // el listado se recarga al reabrir el cajón
    } finally {
      setBackupCreating(false);
    }
  }

  async function handleDeleteBackup(backupId: number) {
    try {
      await api.deleteBackup(server.id, backupId);
      setBackups((prev) => prev?.filter((b) => b.id !== backupId) ?? null);
    } catch {
      // sin cambios visibles si falla
    }
  }

  async function handleRestoreBackup(backupId: number) {
    if (confirmRestore === backupId) {
      try {
        await api.restoreBackup(server.id, backupId);
      } catch {
        // sin cambios visibles si falla
      }
      setConfirmRestore(null);
    } else {
      setConfirmRestore(backupId);
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  }

  const stamp = (unix: number) =>
    new Date(unix * 1000).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Panel rail={isActive} className="flex flex-col" as="article">
      {/* El arte del juego tiene banda propia. Como textura de fondo al 14% no
          se veía, y una opción que se configura pero no se nota no vale nada.
          El icono monta sobre el borde inferior para coser arte e identidad. */}
      {banner && (
        <div className="relative h-14 overflow-hidden rounded-t-lg">
          <img
            src={banner}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Velo hacia abajo: el nombre y el estado caen sobre superficie
              opaca, así que nunca hay texto peleándose con la imagen. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-surface via-surface/45 to-transparent"
          />
        </div>
      )}

      {/* Identidad y estado */}
      <div className={`flex items-start gap-3 px-4 pb-3 ${banner ? "-mt-4" : "pt-3"}`}>
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="relative z-10 h-9 w-9 shrink-0 rounded-sm border border-line object-cover"
          />
        ) : (
          <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-line bg-raised text-faint">
            <GamepadIcon className="h-4 w-4" />
          </span>
        )}
        <div className={`min-w-0 flex-1 ${banner ? "pt-4" : ""}`}>
          <h3 className="truncate text-title font-semibold text-ink">{server.name}</h3>
          <p className="num mt-0.5 truncate text-micro uppercase text-faint">
            {server.game_type} · puerto {server.port}
          </p>
        </div>
        <StatusMark
          tone={status.tone}
          label={status.label}
          live={status.live}
          className={banner ? "pt-4" : "mt-0.5"}
        />
      </div>

      {/* Dirección de conexión: lo primero que alguien viene a buscar */}
      {isRunning && (
        <>
          <Divider />
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="label shrink-0">Entrar</span>
            <span className="num min-w-0 flex-1 truncate text-body text-ink">{address}</span>
            <Button
              tone="ghost"
              size="sm"
              onClick={handleCopy}
              title="Copiar dirección"
              className="shrink-0"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </>
      )}

      {/* Telemetría y jugadores */}
      {isRunning && (
        <>
          <Divider />
          <div className="flex flex-col gap-2.5 px-4 py-3">
            <StatsBar serverId={server.id} hostMemTotalMB={hostMemTotalMB} />
            <OnlinePlayers
              serverId={server.id}
              dockerImage={server.docker_image}
              joinable={server.joinable}
            />
          </div>
        </>
      )}

      {/* Acciones: una gana, el resto se retira a iconos discretos */}
      <Divider />
      <div className="flex items-center gap-2 px-4 py-3">
        {isRunning ? (
          <Button tone="danger" onClick={() => onStop(server.id)} disabled={loading}>
            <StopIcon className="h-3 w-3" />
            {loading ? "Deteniendo" : "Detener"}
          </Button>
        ) : (
          <Button tone="accent" onClick={() => onStart(server.id)} disabled={loading}>
            <PlayIcon className="h-3 w-3" />
            {loading ? "Arrancando" : "Arrancar"}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {isRunning && (
            <Button
              tone="ghost"
              size="sm"
              icon
              onClick={() => onViewLogs(server.id)}
              title="Registro"
            >
              <LogsIcon className="h-4 w-4" />
            </Button>
          )}
          {isAdmin && (
            <Button
              tone="ghost"
              size="sm"
              icon
              onClick={() => onEditConfig(server.id)}
              title="Configuración"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          )}
          {isAdmin && (
            <Button
              tone="ghost"
              size="sm"
              icon
              onClick={() => onOpenFiles(server.id)}
              title="Ficheros"
            >
              <FolderIcon className="h-4 w-4" />
            </Button>
          )}
          {isAdmin && !isRunning && (
            <Button
              tone={confirmDelete ? "danger-solid" : "ghost"}
              size="sm"
              icon={!confirmDelete}
              onClick={handleDeleteClick}
              title={
                confirmDelete ? "Confirmar borrado del servidor y sus ficheros" : "Borrar servidor"
              }
              className={confirmDelete ? "" : "hover:text-danger"}
            >
              {confirmDelete ? "Confirmar" : <TrashIcon className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Cajones: texto, no más iconos */}
      {isAdmin && (
        <>
          <Divider />
          <div className="flex items-center gap-4 px-4 py-2">
            <button
              type="button"
              onClick={() => openDrawer("backups")}
              className={`tap font-mono text-micro uppercase ${
                drawer === "backups" ? "text-accent" : "text-faint hover:text-muted"
              }`}
            >
              Copias{backups ? ` (${backups.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => openDrawer("history")}
              className={`tap font-mono text-micro uppercase ${
                drawer === "history" ? "text-accent" : "text-faint hover:text-muted"
              }`}
            >
              Sesiones
            </button>
          </div>
        </>
      )}

      {drawer === "backups" && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Copias de seguridad</span>
              <Button size="sm" onClick={handleCreateBackup} disabled={backupCreating}>
                {backupCreating ? "Creando" : "Crear copia"}
              </Button>
            </div>
            {backupsLoading ? (
              <p className="text-meta text-faint">Cargando</p>
            ) : backups && backups.length > 0 ? (
              <div className="divide-y divide-line">
                {backups.map((b) => (
                  <Row key={b.id}>
                    <div className="min-w-0">
                      <div className="num text-meta text-muted">{stamp(b.created_at)}</div>
                      <div className="num text-micro text-faint">{formatSize(b.size_bytes)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <ButtonLink
                        href={api.downloadBackupUrl(server.id, b.id)}
                        tone="ghost"
                        size="sm"
                        icon
                        title="Descargar"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                      </ButtonLink>
                      <Button
                        tone={confirmRestore === b.id ? "danger-solid" : "ghost"}
                        size="sm"
                        icon={confirmRestore !== b.id}
                        onClick={() => handleRestoreBackup(b.id)}
                        disabled={isRunning}
                        title={isRunning ? "Detén el servidor antes de restaurar" : "Restaurar"}
                      >
                        {confirmRestore === b.id ? (
                          "Confirmar"
                        ) : (
                          <RestoreIcon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        tone="ghost"
                        size="sm"
                        icon
                        onClick={() => handleDeleteBackup(b.id)}
                        title="Borrar copia"
                        className="hover:text-danger"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Row>
                ))}
              </div>
            ) : (
              <p className="text-meta text-faint">Todavía no hay copias.</p>
            )}
          </div>
        </>
      )}

      {drawer === "history" && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <span className="label">Últimas sesiones</span>
            <div className="mt-2">
              {historyLoading ? (
                <p className="text-meta text-faint">Cargando</p>
              ) : history && history.length > 0 ? (
                <div className="divide-y divide-line">
                  {history.slice(0, 5).map((s) => {
                    const reason = s.stop_reason
                      ? (STOP_REASON[s.stop_reason] ?? {
                          tone: "idle" as Tone,
                          label: s.stop_reason,
                        })
                      : { tone: "ok" as Tone, label: "En marcha" };
                    return (
                      <Row key={s.id}>
                        <span className="num text-meta text-muted">{stamp(s.started_at)}</span>
                        <div className="flex items-center gap-2">
                          {s.duration_seconds !== null && (
                            <span className="num text-micro text-faint">
                              {formatDuration(s.duration_seconds)}
                            </span>
                          )}
                          <Tag tone={reason.tone}>{reason.label}</Tag>
                        </div>
                      </Row>
                    );
                  })}
                </div>
              ) : (
                <p className="text-meta text-faint">Sin sesiones registradas.</p>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
});

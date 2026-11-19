import { existsSync, mkdirSync, rmSync, unlinkSync } from "fs";
import { join, posix } from "path";
import { execRconCommand } from "./adapters/minecraft/rcon";
import { backupQueries, getPanelSetting, serverQueries } from "./db";
import { getContainerStatus, getRunningGameServers } from "./docker";

/** Configurables solo para poder apuntar los tests a carpetas temporales. */
export const BACKUP_DIR = process.env.BACKUP_DIR ?? "/data/backups";
const HOST_DATA_DIR = process.env.HOST_DATA_DIR ?? "/host-data";

export function backupDir(serverId: string): string {
  return join(BACKUP_DIR, serverId);
}

/**
 * Valida las rutas que un servidor quiere dejar fuera de sus respaldos.
 *
 * Se escriben como rutas del host, igual que los volúmenes (`/data/svr2007/disc`),
 * y tienen que caer DENTRO de alguno de los volúmenes del servidor: excluir el
 * volumen entero o algo de fuera no tiene sentido y casi seguro es un error.
 * Admiten `*` como comodín (lo interpreta tar).
 */
export function parseBackupExclude(
  input: unknown,
  volumes: Record<string, string>,
): { ok: true; paths: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Las rutas excluidas deben ir en una lista." };
  }
  const roots = Object.keys(volumes)
    .filter((p) => p.startsWith("/data/"))
    .map((p) => posix.normalize(p).replace(/\/+$/, ""));

  const paths: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Cada ruta excluida debe ser un texto." };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const path = posix.normalize(trimmed).replace(/\/+$/, "");
    if (!roots.some((root) => path.startsWith(`${root}/`))) {
      return {
        ok: false,
        error: `"${trimmed}" no está dentro de ningún volumen de este servidor (${roots.join(", ") || "no tiene"}).`,
      };
    }
    if (!paths.includes(path)) paths.push(path);
  }
  return { ok: true, paths };
}

/** Las exclusiones guardadas de un servidor, como patrones relativos para tar. */
function excludePatterns(server: { backup_exclude?: string | null; volumes: string }): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(server.backup_exclude || "[]");
  } catch {
    return [];
  }
  // Se revalida al usar: los volúmenes pueden haber cambiado desde que se guardó.
  const parsed = parseBackupExclude(stored, JSON.parse(server.volumes) as Record<string, string>);
  if (!parsed.ok) return [];
  return parsed.paths.map((p) => p.replace(/^\/data\//, ""));
}

/**
 * El comando tar de un respaldo (sin el ionice/nice de delante).
 *
 * Las rutas excluidas van con --anchored para que el patrón solo case desde la
 * raíz del archivo: sin eso, excluir `svr2007/disc` también se saltaría
 * cualquier `disc` que hubiera más adentro.
 */
export function backupTarArgs(
  server: { backup_exclude?: string | null; volumes: string },
  outputPath: string,
  relativeDirs: string[],
): string[] {
  const excludes = excludePatterns(server);
  return [
    "tar",
    "--zstd",
    ...(excludes.length > 0 ? ["--anchored", ...excludes.map((p) => `--exclude=${p}`)] : []),
    "-cf",
    outputPath,
    "-C",
    HOST_DATA_DIR,
    ...relativeDirs,
  ];
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export async function createBackup(serverId: string): Promise<{
  id: number;
  filename: string;
  size_bytes: number;
  created_at: number;
}> {
  const server = serverQueries.getById.get(serverId);
  if (!server) throw new Error("Server not found");

  const volumes = JSON.parse(server.volumes) as Record<string, string>;
  // Host paths are the keys — strip /data/ prefix to get relative dirs under /host-data
  const relativeDirs = Object.keys(volumes)
    .filter((p) => p.startsWith("/data/"))
    .map((p) => p.replace(/^\/data\//, ""));

  if (relativeDirs.length === 0) {
    throw new Error("No /data/ volumes configured for this server");
  }

  const dir = backupDir(serverId);
  mkdirSync(dir, { recursive: true });

  const filename = `${serverId}_${timestamp()}.tar.zst`;
  const outputPath = join(dir, filename);

  // For Minecraft: flush world to disk and disable auto-save for consistency
  // Server stays online — players keep playing without interruption
  const isMinecraft = server.game_type === "minecraft";
  const status = await getContainerStatus(serverId);
  const isRunning = status === "running";
  let savesDisabled = false;

  if (isMinecraft && isRunning) {
    try {
      await execRconCommand(serverId, "save-all flush");
      // Give the server a moment to finish flushing chunks to disk
      await new Promise((r) => setTimeout(r, 3000));
      await execRconCommand(serverId, "save-off");
      savesDisabled = true;
      console.log(`[backup] Minecraft save-off for ${serverId}`);
    } catch (err) {
      console.warn(`[backup] Could not run save-off for ${serverId}, continuing anyway:`, err);
    }
  }

  try {
    // ionice -c3 = idle I/O priority (only uses disk when server doesn't need it)
    // nice -n 19 = lowest CPU priority
    // --zstd = zstandard compression (3-5x faster than gzip, similar ratio)
    const proc = Bun.spawn(
      ["ionice", "-c3", "nice", "-n", "19", ...backupTarArgs(server, outputPath, relativeDirs)],
      { stdout: "ignore", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`tar failed (exit ${exitCode}): ${stderr}`);
    }
  } finally {
    // Always re-enable saves, even if tar fails
    if (savesDisabled) {
      try {
        await execRconCommand(serverId, "save-on");
        console.log(`[backup] Minecraft save-on for ${serverId}`);
      } catch (err) {
        console.error(`[backup] CRITICAL: Could not re-enable saves for ${serverId}:`, err);
      }
    }
  }

  const sizeBytes = Bun.file(outputPath).size;
  const createdAt = Math.floor(Date.now() / 1000);
  backupQueries.insert.run(serverId, filename, sizeBytes, createdAt);

  // Get the inserted record's id
  const list = backupQueries.list.all(serverId);
  const record = list.find((b) => b.filename === filename)!;

  await pruneOldBackups(serverId);

  return {
    id: record.id,
    filename: record.filename,
    size_bytes: record.size_bytes,
    created_at: record.created_at,
  };
}

export async function restoreBackup(serverId: string, backupId: number): Promise<void> {
  const status = await getContainerStatus(serverId);
  if (status === "running") {
    throw new Error("Cannot restore while server is running. Stop it first.");
  }

  const backup = backupQueries.getById.get(backupId);
  if (!backup || backup.server_id !== serverId) {
    throw new Error("Backup not found");
  }

  const backupPath = join(backupDir(serverId), backup.filename);
  if (!existsSync(backupPath)) {
    throw new Error("Backup file not found on disk");
  }

  // Support both old .tar.gz and new .tar.zst backups
  const tarFlags = backup.filename.endsWith(".tar.zst") ? ["--zstd", "-xf"] : ["-xzf"];
  const proc = Bun.spawn(["tar", ...tarFlags, backupPath, "-C", HOST_DATA_DIR], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar restore failed (exit ${exitCode}): ${stderr}`);
  }
}

export function deleteBackupFile(backupId: number): void {
  const backup = backupQueries.getById.get(backupId);
  if (!backup) throw new Error("Backup not found");

  const filePath = join(backupDir(backup.server_id), backup.filename);
  try {
    unlinkSync(filePath);
  } catch {
    // File may already be gone
  }
  backupQueries.deleteById.run(backupId);
}

/**
 * Borra TODOS los respaldos de un servidor: los archivos, su carpeta y las filas
 * de la base. Es lo que hace el borrado de un servidor; antes se quedaban.
 */
export function deleteServerBackups(serverId: string): { files: number; bytes: number } {
  const rows = backupQueries.list.all(serverId);
  const bytes = rows.reduce((sum, b) => sum + b.size_bytes, 0);

  // El id acaba en una ruta: sin esta comprobación un id vacío borraría la
  // carpeta de respaldos de todos los servidores.
  if (/^[A-Za-z0-9_-]+$/.test(serverId)) {
    rmSync(backupDir(serverId), { recursive: true, force: true });
  }
  backupQueries.deleteByServerId.run(serverId);
  return { files: rows.length, bytes };
}

export async function pruneOldBackups(serverId: string): Promise<void> {
  const max = Number(getPanelSetting("max_backups_per_server")) || 5;
  let count = backupQueries.count.get(serverId)?.cnt ?? 0;

  while (count > max) {
    const oldest = backupQueries.oldest.get(serverId);
    if (!oldest) break;
    deleteBackupFile(oldest.id);
    count--;
  }
}

export function getBackupFilePath(backup: { server_id: string; filename: string }): string {
  return join(backupDir(backup.server_id), backup.filename);
}

let autoBackupInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoBackupTimer(): void {
  if (autoBackupInterval) return;

  // Check every 60 minutes
  autoBackupInterval = setInterval(
    async () => {
      try {
        const intervalHours = Number(getPanelSetting("auto_backup_interval_hours"));
        if (intervalHours <= 0) return;

        // Respalda CADA servidor corriendo (varios pueden estar activos a la vez)
        const running = await getRunningGameServers();
        if (running.length === 0) return;

        const now = Math.floor(Date.now() / 1000);
        const intervalSeconds = intervalHours * 3600;

        for (const { name: serverId } of running) {
          const backups = backupQueries.list.all(serverId);
          const lastBackupTime = backups.length > 0 ? backups[0].created_at : 0;
          if (now - lastBackupTime < intervalSeconds) continue;
          try {
            console.log(`[auto-backup] Creating backup for ${serverId}`);
            await createBackup(serverId);
            console.log(`[auto-backup] Backup created for ${serverId}`);
          } catch (err) {
            console.error(`[auto-backup] Error backing up ${serverId}:`, err);
          }
        }
      } catch (err) {
        console.error("[auto-backup] Error:", err);
      }
    },
    60 * 60 * 1000,
  );
}

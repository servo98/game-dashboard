import { mkdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { serverQueries, backupQueries, getPanelSetting } from "./db";
import { docker, gameContainerName, getActiveContainer, getContainerStatus } from "./docker";

const BACKUP_DIR = "/data/backups";
const HOST_DATA_DIR = "/host-data";

function backupDir(serverId: string): string {
  return join(BACKUP_DIR, serverId);
}

function timestamp(): string {
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

  const filename = `${serverId}_${timestamp()}.tar.gz`;
  const outputPath = join(dir, filename);

  // Pause container if running (freeze without killing)
  let paused = false;
  const status = await getContainerStatus(serverId);
  if (status === "running") {
    try {
      const container = docker.getContainer(gameContainerName(serverId));
      await container.pause();
      paused = true;
    } catch {
      // If pause fails, continue anyway
    }
  }

  try {
    const proc = Bun.spawn(["tar", "-czf", outputPath, "-C", HOST_DATA_DIR, ...relativeDirs], {
      stdout: "ignore",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`tar failed (exit ${exitCode}): ${stderr}`);
    }
  } finally {
    if (paused) {
      try {
        const container = docker.getContainer(gameContainerName(serverId));
        await container.unpause();
      } catch {
        // ignore
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

  const proc = Bun.spawn(["tar", "-xzf", backupPath, "-C", HOST_DATA_DIR], {
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
  autoBackupInterval = setInterval(async () => {
    try {
      const intervalHours = Number(getPanelSetting("auto_backup_interval_hours"));
      if (intervalHours <= 0) return;

      const active = await getActiveContainer();
      if (!active) return;

      const serverId = active.name;
      const backups = backupQueries.list.all(serverId);
      const lastBackupTime = backups.length > 0 ? backups[0].created_at : 0;
      const now = Math.floor(Date.now() / 1000);
      const intervalSeconds = intervalHours * 3600;

      if (now - lastBackupTime >= intervalSeconds) {
        console.log(`[auto-backup] Creating backup for ${serverId}`);
        await createBackup(serverId);
        console.log(`[auto-backup] Backup created for ${serverId}`);
      }
    } catch (err) {
      console.error("[auto-backup] Error:", err);
    }
  }, 60 * 60 * 1000);
}

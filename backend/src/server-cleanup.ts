import { existsSync, readdirSync, rmdirSync, rmSync, statSync } from "fs";
import { dirname, join, posix } from "path";
import { BACKUP_DIR, deleteServerBackups } from "./backup";
import {
  countOrphanRows,
  deleteOrphanRows,
  inviteLinkQueries,
  serverQueries,
  serverSessionQueries,
  userServerAccessQueries,
} from "./db";
import {
  docker,
  getContainerStatus,
  type ImageRemoval,
  markIntentionalStop,
  removeGameContainer,
  removeImageIfUnused,
} from "./docker";
import { stopJoinableWatcher } from "./joinable-status";
import { type ActionResult, imageRefsOfOtherServers, resolveImageRef } from "./server-actions";

/**
 * Todo lo que un servidor deja en el host y hay que llevarse al borrarlo.
 *
 * Durante meses el borrado solo quitó la fila y la carpeta de /data. El
 * contenedor parado se quedaba (solo se reemplaza cuando ese mismo servidor
 * vuelve a arrancar, y uno borrado ya no arranca), y con él su imagen, porque
 * Docker la sigue contando como en uso. Respaldos, banner y permisos tampoco se
 * tocaban. Se limpió a mano más de una vez y volvía a pasar.
 */

/** Configurable solo para poder apuntar los tests a una carpeta temporal. */
const HOST_DATA_DIR = process.env.HOST_DATA_DIR ?? "/host-data";
const CONTAINER_PREFIX = "game-panel-";
const BANNER_EXTS = ["jpg", "png", "webp"];

function bannerDir(): string {
  return `${process.env.DATA_DIR ?? "/data"}/banners`;
}

/** Un id que puede acabar en una ruta sin escaparse de su carpeta. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/** `/data/x/y` → `x/y`, o null si no es una ruta borrable bajo /data. */
function relativeDataPath(hostPath: string): string | null {
  if (!hostPath.startsWith("/data/")) return null;
  const rel = posix.normalize(hostPath.slice("/data/".length)).replace(/\/+$/, "");
  if (!rel || rel === "." || rel === ".." || rel.startsWith("../")) return null;
  return rel;
}

function volumePaths(volumesJson: string): string[] {
  try {
    return Object.keys(JSON.parse(volumesJson) as Record<string, string>);
  } catch {
    return [];
  }
}

export type DeleteReport = {
  /** Se quitó su contenedor (false = no tenía). */
  container: boolean;
  /** Qué pasó con su imagen; null = no había ninguna que revisar. */
  image: ImageRemoval | null;
  /** Carpetas de datos borradas (rutas del host). */
  data_removed: string[];
  /** Carpetas que NO se borraron y por qué. */
  data_kept: { path: string; reason: string }[];
  backups: { files: number; bytes: number };
  /** Pasos que fallaron sin impedir el borrado. */
  warnings: string[];
};

function removeServerData(
  id: string,
  volumesJson: string,
): Pick<DeleteReport, "data_removed" | "data_kept" | "warnings"> {
  const removed: string[] = [];
  const kept: DeleteReport["data_kept"] = [];
  const warnings: string[] = [];

  // Rutas que usan los demás servidores: una carpeta compartida no se borra.
  const others = serverQueries.getAll
    .all()
    .filter((s) => s.id !== id)
    .flatMap((s) => volumePaths(s.volumes).map(relativeDataPath))
    .filter((p): p is string => p !== null);

  for (const hostPath of volumePaths(volumesJson)) {
    const rel = relativeDataPath(hostPath);
    if (rel === null) {
      // Fuera de /data (o /data entero): el panel no lo creó y no lo borra.
      kept.push({ path: hostPath, reason: "fuera de /data" });
      continue;
    }
    const shared = others.some(
      (o) => o === rel || o.startsWith(`${rel}/`) || rel.startsWith(`${o}/`),
    );
    if (shared) {
      kept.push({ path: hostPath, reason: "la usa otro servidor" });
      continue;
    }

    const accessPath = join(HOST_DATA_DIR, rel);
    try {
      rmSync(accessPath, { recursive: true, force: true });
      removed.push(hostPath);
    } catch (err) {
      warnings.push(`No se pudo borrar ${hostPath}: ${(err as Error).message}`);
      continue;
    }

    // Carpetas padre que se quedan vacías (p. ej. /data/valheim tras borrar
    // /data/valheim/config y /data/valheim/data). rmdir falla si no está vacía.
    let parent = dirname(accessPath);
    while (parent !== HOST_DATA_DIR && parent.startsWith(`${HOST_DATA_DIR}/`)) {
      try {
        rmdirSync(parent);
      } catch {
        break;
      }
      parent = dirname(parent);
    }
  }

  return { data_removed: removed, data_kept: kept, warnings };
}

function removeBanner(id: string): void {
  if (!isSafeId(id)) return;
  for (const ext of BANNER_EXTS) {
    rmSync(`${bannerDir()}/${id}.${ext}`, { force: true });
  }
}

/** Quita un servidor de las invitaciones que todavía lo ofrecen. */
function removeFromInvites(id: string): void {
  for (const invite of inviteLinkQueries.listAll.all()) {
    let ids: unknown;
    try {
      ids = JSON.parse(invite.server_ids);
    } catch {
      continue;
    }
    if (!Array.isArray(ids) || !ids.includes(id)) continue;
    inviteLinkQueries.updateServerIds.run(JSON.stringify(ids.filter((s) => s !== id)), invite.id);
  }
}

/**
 * Borra un servidor sin dejar nada: contenedor, imagen (si nadie más la usa),
 * datos, respaldos, banner y todas sus filas en la base.
 *
 * El contenedor va primero y es el único paso que aborta: si Docker no deja
 * quitarlo, no se toca nada más, para no dejar un contenedor sin servidor (que
 * es justo el resto que este borrado existe para evitar).
 */
export async function deleteServer(id: string): Promise<ActionResult<DeleteReport>> {
  const server = serverQueries.getById.get(id);
  if (!server) return { ok: false, code: "not_found", error: `Server "${id}" not found.` };

  if ((await getContainerStatus(id)) === "running") {
    return {
      ok: false,
      code: "invalid",
      error: "Cannot delete a running server. Stop it first.",
    };
  }

  stopJoinableWatcher(id);
  markIntentionalStop(id);

  let container: { removed: boolean; imageId: string | null };
  try {
    container = await removeGameContainer(id);
  } catch (err) {
    return {
      ok: false,
      code: "docker",
      error: `No se pudo quitar el contenedor: ${(err as Error).message}`,
    };
  }

  const warnings: string[] = [];

  const data = removeServerData(id, server.volumes);
  warnings.push(...data.warnings);

  let backups = { files: 0, bytes: 0 };
  try {
    backups = deleteServerBackups(id);
  } catch (err) {
    warnings.push(`No se pudieron borrar los respaldos: ${(err as Error).message}`);
  }

  try {
    removeBanner(id);
  } catch (err) {
    warnings.push(`No se pudo borrar el banner: ${(err as Error).message}`);
  }

  serverSessionQueries.deleteByServerId.run(id);
  userServerAccessQueries.deleteByServer.run(id);
  removeFromInvites(id);
  serverQueries.deleteById.run(id);

  // La imagen al final: el contenedor ya no la retiene y la fila ya no cuenta.
  // Se prueba la del contenedor y la configurada (pueden diferir si se cambió
  // la imagen sin volver a arrancar).
  const keep = imageRefsOfOtherServers(id);
  let image: ImageRemoval | null = null;
  for (const candidate of new Set([container.imageId, resolveImageRef(server)])) {
    if (!candidate) continue;
    const result = await removeImageIfUnused(candidate, keep);
    if (result === "missing") continue;
    // Si alguna se queda, ese es el dato que le interesa a quien borra.
    if (image === null || result !== "removed") image = result;
  }

  for (const w of warnings) console.warn(`[delete ${id}] ${w}`);

  return {
    ok: true,
    data: {
      container: container.removed,
      image,
      data_removed: data.data_removed,
      data_kept: data.data_kept,
      backups,
      warnings,
    },
  };
}

// ─── Restos de servidores que ya no existen ─────────────────────────────────

export type Orphans = {
  /** Contenedores de juego sin servidor en el panel. */
  containers: { name: string; image: string; status: string; running: boolean }[];
  /** Carpetas de respaldos de servidores que ya no existen. */
  backup_dirs: { server_id: string; files: number; bytes: number }[];
  /** Banners de servidores que ya no existen. */
  banners: string[];
  /** Filas de la base que apuntan a servidores que ya no existen. */
  db_rows: { table: string; server_id: string; rows: number }[];
  /**
   * Imágenes sin etiqueta: versiones anteriores que dejó una actualización.
   * Sin tamaño a propósito: comparten capas, así que sumar el de cada una da
   * varias veces lo que de verdad se libera (35 GB sumados frente a 8 reales).
   */
  dangling_images: number;
};

function dirStats(path: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  try {
    for (const entry of readdirSync(path)) {
      const st = statSync(join(path, entry));
      if (st.isDirectory()) continue;
      files++;
      bytes += st.size;
    }
  } catch {
    // carpeta ilegible: se reporta vacía
  }
  return { files, bytes };
}

async function orphanContainers(known: Set<string>) {
  const all = await docker.listContainers({ all: true });
  return all
    .filter(
      (c) =>
        c.Names.some((n) => n.startsWith(`/${CONTAINER_PREFIX}`)) &&
        // Los servicios del compose (backend, nginx…) también empiezan por
        // game-panel-, pero llevan esta etiqueta y no son servidores de juego.
        !c.Labels["com.docker.compose.service"],
    )
    .map((c) => ({
      id: c.Id,
      imageId: c.ImageID,
      name: c.Names[0].replace(/^\//, ""),
      image: c.Image,
      status: c.Status,
      running: c.State === "running",
    }))
    .filter((c) => !known.has(c.name.slice(CONTAINER_PREFIX.length)));
}

function orphanBackupDirs(known: Set<string>): Orphans["backup_dirs"] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name))
    .map((e) => ({ server_id: e.name, ...dirStats(join(BACKUP_DIR, e.name)) }));
}

function orphanBanners(known: Set<string>): string[] {
  if (!existsSync(bannerDir())) return [];
  return readdirSync(bannerDir()).filter((file) => {
    const dot = file.lastIndexOf(".");
    if (dot < 0 || !BANNER_EXTS.includes(file.slice(dot + 1))) return false;
    return !known.has(file.slice(0, dot));
  });
}

const DANGLING = { filters: { dangling: ["true"] } };

export async function findOrphans(): Promise<Orphans> {
  const known = new Set(serverQueries.getAll.all().map((s) => s.id));
  const dangling = await docker.listImages(DANGLING);

  return {
    containers: (await orphanContainers(known)).map(({ name, image, status, running }) => ({
      name,
      image,
      status,
      running,
    })),
    backup_dirs: orphanBackupDirs(known),
    banners: orphanBanners(known),
    db_rows: countOrphanRows(),
    dangling_images: dangling.length,
  };
}

export type OrphanCleanup = {
  containers_removed: string[];
  /** Contenedores sin servidor que siguen corriendo: no se tocan. */
  containers_skipped: string[];
  images_removed: number;
  backup_dirs_removed: string[];
  banners_removed: string[];
  db_rows_removed: number;
  /** Lo que Docker dice haber liberado en imágenes más lo que pesaban las copias. */
  bytes_reclaimed: number;
  warnings: string[];
};

/**
 * Borra los restos de servidores que ya no existen. Nunca toca nada de un
 * servidor que siga en el panel, ni un contenedor que esté corriendo.
 */
export async function removeOrphans(): Promise<OrphanCleanup> {
  const servers = serverQueries.getAll.all();
  // "Huérfano" es todo lo que no esté en esta lista. Si viene vacía (base recién
  // creada, o leída mal) TODO parecería huérfano: mejor no borrar nada.
  if (servers.length === 0) {
    throw new Error("El panel no tiene servidores; por seguridad no se limpia nada.");
  }
  const known = new Set(servers.map((s) => s.id));
  const keep = servers.map(resolveImageRef);

  const report: OrphanCleanup = {
    containers_removed: [],
    containers_skipped: [],
    images_removed: 0,
    backup_dirs_removed: [],
    banners_removed: [],
    db_rows_removed: 0,
    bytes_reclaimed: 0,
    warnings: [],
  };

  // Contenedores, y la imagen de cada uno si ya nadie la usa
  const imageIds = new Set<string>();
  for (const c of await orphanContainers(known)) {
    if (c.running) {
      report.containers_skipped.push(c.name);
      continue;
    }
    try {
      await docker.getContainer(c.id).remove({ v: true });
      report.containers_removed.push(c.name);
      imageIds.add(c.imageId);
    } catch (err) {
      report.warnings.push(`No se pudo quitar ${c.name}: ${(err as Error).message}`);
    }
  }
  for (const imageId of imageIds) {
    if ((await removeImageIfUnused(imageId, keep)) === "removed") report.images_removed++;
  }

  // Imágenes sin etiqueta que ya no usa ningún contenedor
  try {
    const pruned = await docker.pruneImages(DANGLING);
    report.images_removed += (pruned.ImagesDeleted ?? []).filter((i) => i.Deleted).length;
    report.bytes_reclaimed += pruned.SpaceReclaimed ?? 0;
  } catch (err) {
    report.warnings.push(`No se pudieron limpiar las imágenes: ${(err as Error).message}`);
  }

  for (const dir of orphanBackupDirs(known)) {
    if (!isSafeId(dir.server_id)) continue;
    try {
      rmSync(join(BACKUP_DIR, dir.server_id), { recursive: true, force: true });
      report.backup_dirs_removed.push(dir.server_id);
      report.bytes_reclaimed += dir.bytes;
    } catch (err) {
      report.warnings.push(`No se pudo borrar backups/${dir.server_id}: ${(err as Error).message}`);
    }
  }

  for (const file of orphanBanners(known)) {
    try {
      rmSync(join(bannerDir(), file), { force: true });
      report.banners_removed.push(file);
    } catch (err) {
      report.warnings.push(`No se pudo borrar el banner ${file}: ${(err as Error).message}`);
    }
  }

  report.db_rows_removed = countOrphanRows().reduce((sum, r) => sum + r.rows, 0);
  deleteOrphanRows();

  return report;
}

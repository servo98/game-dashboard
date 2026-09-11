import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { manifestPathFor } from "./build-status";

/**
 * Desatasca a steamcmd borrando su contabilidad.
 *
 * Cuando un update se corta a medias, el appmanifest queda con UpdateResult
 * distinto de 0 y steamcmd aborta cada intento en segundos sin descargar nada.
 * Sin manifest vuelve a empezar de cero: revalida lo que ya hay en disco y baja
 * solo lo que falte.
 *
 * Solo toca el volumen de datos (/opt/valheim), nunca el de configuración
 * (/config), que es donde viven los mundos y los backups.
 */

/** Restos de descargas a medias que steamcmd no limpia solo. */
const SCRATCH_DIRS = ["downloading", "temp"];

export type SteamStateReset = {
  /** Rutas efectivamente borradas. Vacío si no había nada que limpiar. */
  removed: string[];
};

/**
 * Borra el appmanifest y los directorios de descarga a medias.
 *
 * Lanza si el server no tiene un volumen de datos legible: sin él no hay nada
 * que desatascar y seguir adelante daría una falsa sensación de arreglo.
 */
export function clearSteamUpdateState(volumes: Record<string, string>): SteamStateReset {
  const manifestPath = manifestPathFor(volumes);
  if (!manifestPath) {
    throw new Error("Este servidor no monta /opt/valheim, no hay estado de steamcmd que limpiar.");
  }

  const steamapps = dirname(manifestPath);
  const removed: string[] = [];

  if (existsSync(manifestPath)) {
    rmSync(manifestPath, { force: true });
    removed.push(manifestPath);
  }

  for (const dir of SCRATCH_DIRS) {
    const path = `${steamapps}/${dir}`;
    if (!existsSync(path)) continue;
    // Vaciamos el directorio en vez de borrarlo: steamcmd espera encontrarlo.
    for (const entry of readdirSync(path)) {
      rmSync(`${path}/${entry}`, { recursive: true, force: true });
      removed.push(`${path}/${entry}`);
    }
  }

  return { removed };
}

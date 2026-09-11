import { existsSync, readFileSync } from "node:fs";

/**
 * Estado de la instalación de Valheim según steamcmd.
 *
 * La imagen de lloesche no trae el juego: lo baja steamcmd al arrancar y luego
 * cada 15 min por cron. Ese proceso deja su contabilidad en un appmanifest de
 * Steam dentro del volumen de datos, y ahí está la única fuente honesta de qué
 * versión corre el server.
 *
 * Importa porque el updater miente: si steamcmd falla, el script cae a la copia
 * local y loguea "Valheim Server is already the latest version". Reiniciar no
 * arregla nada — el estado atascado vive en el volumen, no en el contenedor —
 * así que el server puede pasar días viejo sin que nadie se entere hasta que un
 * jugador no puede entrar.
 */

/** AppID del servidor dedicado de Valheim en Steam. */
export const VALHEIM_APP_ID = "896660";

/** Ruta del appmanifest dentro del volumen montado en /opt/valheim. */
const MANIFEST_SUBPATH = `dl/server/steamapps/appmanifest_${VALHEIM_APP_ID}.acf`;

export type ValheimBuildState =
  /** Lo instalado coincide con lo que ofrece Steam. */
  | "up-to-date"
  /** Steam tiene una build más nueva y steamcmd aún no la ha traído. */
  | "update-pending"
  /** El último intento de update falló: steamcmd no reintentará solo. */
  | "update-failed"
  /** No hay manifest legible (server nunca arrancado, o volumen distinto). */
  | "unknown";

export type ValheimBuildStatus = {
  state: ValheimBuildState;
  /** Build instalada y en uso. */
  installedBuild: string | null;
  /** Build que Steam ofrece. Igual a installedBuild cuando está al día. */
  targetBuild: string | null;
  /** Cuándo terminó el último update con éxito (epoch en segundos). */
  lastUpdated: number | null;
};

/** Lee un campo escalar del nivel raíz del ACF: `"clave"\t\t"valor"`. */
function readField(manifest: string, key: string): string | null {
  const match = manifest.match(new RegExp(`"${key}"\\s+"([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * Interpreta un appmanifest de Steam.
 *
 * Las dos señales que importan:
 * - `buildid` vs `TargetBuildID`: si difieren, hay versión nueva sin instalar.
 * - `UpdateResult`: distinto de 0 significa que el último intento reventó, y
 *   steamcmd se queda en bucle abortando en segundos (`state is 0x6 after
 *   update job`) hasta que alguien borra el manifest.
 */
export function parseAppManifest(manifest: string): ValheimBuildStatus {
  const installedBuild = readField(manifest, "buildid");
  const targetBuild = readField(manifest, "TargetBuildID");
  const updateResult = readField(manifest, "UpdateResult");
  const lastUpdatedRaw = readField(manifest, "LastUpdated");
  const lastUpdated = lastUpdatedRaw ? Number(lastUpdatedRaw) : null;

  const base = {
    installedBuild,
    targetBuild,
    lastUpdated: Number.isFinite(lastUpdated) ? lastUpdated : null,
  };

  if (!installedBuild) return { ...base, state: "unknown" };

  // Un update fallido manda sobre todo lo demás: aunque las builds coincidan,
  // steamcmd no volverá a intentarlo por su cuenta.
  if (updateResult && updateResult !== "0") return { ...base, state: "update-failed" };

  if (targetBuild && targetBuild !== installedBuild) return { ...base, state: "update-pending" };

  return { ...base, state: "up-to-date" };
}

/**
 * Ruta al appmanifest en el sistema de ficheros del backend.
 *
 * Los volúmenes del server mapean host -> contenedor; nos interesa el que va a
 * /opt/valheim. El backend ve los datos del host bajo /host-data (ver el bind
 * `/data:/host-data` del compose), así que traducimos el prefijo.
 */
export function manifestPathFor(volumes: Record<string, string>): string | null {
  const hostPath = Object.entries(volumes).find(([, mount]) => mount === "/opt/valheim")?.[0];
  if (!hostPath || !hostPath.startsWith("/data/")) return null;
  return `${hostPath.replace(/^\/data\//, "/host-data/")}/${MANIFEST_SUBPATH}`;
}

const UNKNOWN: ValheimBuildStatus = {
  state: "unknown",
  installedBuild: null,
  targetBuild: null,
  lastUpdated: null,
};

/** Lee el estado de build de un server de Valheim. Nunca lanza. */
export function readValheimBuildStatus(volumes: Record<string, string>): ValheimBuildStatus {
  const path = manifestPathFor(volumes);
  if (!path || !existsSync(path)) return UNKNOWN;
  try {
    return parseAppManifest(readFileSync(path, "utf8"));
  } catch {
    return UNKNOWN;
  }
}

/** Si la imagen es la de Valheim, el estado de build tiene sentido para ella. */
export function isValheimImage(image: string | undefined): boolean {
  return !!image && /valheim-server/.test(image);
}

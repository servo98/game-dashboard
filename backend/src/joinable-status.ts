import { serverQueries } from "./db";
import { getContainerStatus, getRunningGameServers, streamContainerLogs } from "./docker";

type JoinableState = "starting" | "joinable";

const statusMap = new Map<string, JoinableState>();
const watcherAborts = new Map<string, AbortController>();

/**
 * Patrones de "listo" por servidor. Cuando el watcher ve una de estas líneas en
 * los logs, marca el server como joinable (deja de mostrar "Starting...").
 * - Minecraft: la línea "Done (..s)!".
 * - Desglosador 3000 (web app): el api imprime "[api] escuchando en http..." al
 *   bindear; en ese momento la web ya queda servible por el nginx interno.
 * - Valheim: "Game server connected", que sale tras cargar el mundo y conectar
 *   con Steam; hasta esa línea el server no acepta jugadores.
 */
const READY_REGEXES = [
  /Done \(\d+[.,]\d+s\)! For help, type "help"/,
  /\[api\] escuchando en http/,
  /Game server connected/,
];

export function isJoinableLine(line: string): boolean {
  return READY_REGEXES.some((re) => re.test(line));
}

/**
 * Imágenes cuyo "listo" sabemos reconocer en los logs. Son juegos que abren el
 * puerto mucho antes de aceptar jugadores, así que para ellos el patrón es la
 * única señal honesta y no vale suponer nada por el hecho de que el contenedor
 * siga en pie.
 */
const IMAGES_WITH_READY_PATTERN = [/itzg\/minecraft-server/, /valheim-server/];

export function hasReadyPattern(image: string | undefined): boolean {
  if (!image) return false;
  return IMAGES_WITH_READY_PATTERN.some((re) => re.test(image));
}

/**
 * Margen antes de dar por listo un contenedor del que no sabemos leer el
 * arranque. Si a los 20 segundos sigue en pie, ya no está arrancando: o sirve o
 * habría muerto.
 */
const ASSUME_READY_MS = 20_000;

const readyTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getJoinableStatus(serverId: string): JoinableState | null {
  return statusMap.get(serverId) ?? null;
}

export function setStarting(serverId: string): void {
  statusMap.set(serverId, "starting");
}

export function clearJoinable(serverId: string): void {
  statusMap.delete(serverId);
}

/**
 * Empieza a vigilar el arranque de un servidor.
 *
 * Para las imágenes conocidas basta con esperar su línea de "listo". Para
 * cualquier otra (una app propia publicada en GHCR, por ejemplo) no hay línea
 * que esperar: antes se quedaban en "Arrancando" para siempre, así que se pasa
 * a listo si el contenedor sigue vivo tras un margen.
 */
export function beginLogWatching(serverId: string, image?: string): void {
  // Clean up any existing watcher
  stopJoinableWatcher(serverId);

  setStarting(serverId);

  if (!hasReadyPattern(image)) {
    const timer = setTimeout(async () => {
      readyTimers.delete(serverId);
      // Solo si nadie lo marcó ya y el contenedor no se ha caído entretanto.
      if (statusMap.get(serverId) !== "starting") return;
      try {
        if ((await getContainerStatus(serverId)) === "running") {
          statusMap.set(serverId, "joinable");
        }
      } catch {
        // Si no se puede consultar, se queda como está.
      }
    }, ASSUME_READY_MS);
    // No debe mantener vivo el proceso si es lo único pendiente.
    timer.unref?.();
    readyTimers.set(serverId, timer);
  }

  const ac = new AbortController();
  watcherAborts.set(serverId, ac);

  (async () => {
    try {
      for await (const line of streamContainerLogs(serverId, ac.signal)) {
        if (ac.signal.aborted) break;
        if (isJoinableLine(line)) {
          statusMap.set(serverId, "joinable");
          // Keep watching — server could restart inside the container
          // but for now we just need the first Done line
          break;
        }
      }
    } catch {
      // Stream ended or aborted — that's fine
    }
  })();
}

/** Stop watching and clear status for a server */
export function stopJoinableWatcher(serverId: string): void {
  const ac = watcherAborts.get(serverId);
  if (ac) {
    ac.abort();
    watcherAborts.delete(serverId);
  }
  const timer = readyTimers.get(serverId);
  if (timer) {
    clearTimeout(timer);
    readyTimers.delete(serverId);
  }
  clearJoinable(serverId);
}

/**
 * Reconstruye el estado de arranque al levantar el backend.
 *
 * El mapa vive en memoria, así que un reinicio (cada deploy) lo borra para los
 * contenedores que ya estaban en marcha y sus tarjetas se quedan en "En marcha"
 * aunque el servicio lleve horas sirviendo.
 *
 * Solo se reconstruye lo que se puede afirmar sin inventar: para una imagen de
 * la que no sabemos leer el arranque, "el contenedor sigue en pie" ya es la
 * definición de listo que usa beginLogWatching tras su margen, así que aplicarla
 * aquí no añade ninguna suposición nueva. Minecraft y Valheim se quedan fuera a
 * propósito: abren el puerto antes de aceptar jugadores y su única señal honesta
 * es la línea de log, que a estas alturas ya se perdió. Para esos, "En marcha"
 * es la verdad disponible.
 */
export async function reconcileJoinableOnBoot(): Promise<void> {
  try {
    const running = await getRunningGameServers();
    if (running.length === 0) return;

    const byId = new Map(serverQueries.getAll.all().map((s) => [s.id, s]));
    for (const container of running) {
      if (statusMap.has(container.id)) continue;
      const server = byId.get(container.id);
      if (!server || hasReadyPattern(server.docker_image)) continue;
      statusMap.set(container.id, "joinable");
    }
  } catch (err) {
    // Sin reconciliación las tarjetas se ven "En marcha": peor, pero no roto.
    console.error("No se pudo reconstruir el estado de arranque:", err);
  }
}

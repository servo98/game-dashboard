import { streamContainerLogs } from "./docker";

type JoinableState = "starting" | "joinable";

const statusMap = new Map<string, JoinableState>();
const watcherAborts = new Map<string, AbortController>();

/**
 * Patrones de "listo" por servidor. Cuando el watcher ve una de estas líneas en
 * los logs, marca el server como joinable (deja de mostrar "Starting...").
 * - Minecraft: la línea "Done (..s)!".
 * - Desglosador 3000 (web app): el api imprime "[api] escuchando en http..." al
 *   bindear; en ese momento la web ya queda servible por el nginx interno.
 */
const READY_REGEXES = [/Done \(\d+[.,]\d+s\)! For help, type "help"/, /\[api\] escuchando en http/];

export function isJoinableLine(line: string): boolean {
  return READY_REGEXES.some((re) => re.test(line));
}

export function getJoinableStatus(serverId: string): JoinableState | null {
  return statusMap.get(serverId) ?? null;
}

export function setStarting(serverId: string): void {
  statusMap.set(serverId, "starting");
}

export function clearJoinable(serverId: string): void {
  statusMap.delete(serverId);
}

/** Start watching container logs for the "Done" line to mark as joinable */
export function beginLogWatching(serverId: string): void {
  // Clean up any existing watcher
  stopJoinableWatcher(serverId);

  setStarting(serverId);

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
  clearJoinable(serverId);
}

import { streamContainerLogs } from "./docker";

type JoinableState = "starting" | "joinable";

const statusMap = new Map<string, JoinableState>();
const watcherAborts = new Map<string, AbortController>();

/** Regex matching the Minecraft "Done" log line indicating the server is joinable */
const DONE_REGEX = /Done \(\d+[.,]\d+s\)! For help, type "help"/;

export function isJoinableLine(line: string): boolean {
  return DONE_REGEX.test(line);
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

export function connectAddress(gameType: string, port: number, hostDomain: string): string {
  if (gameType === "sandbox" && port === 25565) {
    return `mc.${hostDomain}`;
  }
  return `${hostDomain}:${port}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Convert "2026-02-28T00:44:15Z\tmessage" to "[HH:MM:SS] message" in local time */
export function formatLine(raw: string): string {
  const tabIdx = raw.indexOf("\t");
  if (tabIdx > 0) {
    const iso = raw.slice(0, tabIdx);
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      const time = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return `[${time}] ${raw.slice(tabIdx + 1)}`;
    }
  }
  return raw;
}

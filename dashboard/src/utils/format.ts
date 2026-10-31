const SUBDOMAIN_MAP: Record<string, string> = {
  "25565": "mc",
  "30000": "rolcito",
  "8080": "desglosador3000",
};

/** Tipos cuyo cliente es el propio juego (Minecraft, Valheim): la dirección va sin esquema. */
const GAME_CLIENT_TYPES = new Set(["sandbox", "survival"]);

/**
 * Dirección con la que se entra a un servidor. El subdominio se decide por
 * puerto, no por juego: dos servidores del mismo juego en puertos distintos
 * necesitan direcciones distintas. Todo lo que se abre en el navegador (tools,
 * tabletop, other…) va con `https://`, sin excepción: así el navegador no
 * prueba http al pegar la dirección.
 */
export function connectAddress(port: number, hostDomain: string, gameType?: string): string {
  const sub = SUBDOMAIN_MAP[String(port)];
  const address = sub ? `${sub}.${hostDomain}` : `${hostDomain}:${port}`;
  if (gameType && !GAME_CLIENT_TYPES.has(gameType)) return `https://${address}`;
  return address;
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

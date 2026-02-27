const BASE = "/api";

export type ServerStatus = "running" | "stopped" | "missing";

export type GameServer = {
  id: string;
  name: string;
  game_type: string;
  port: number;
  status: ServerStatus;
};

export type User = {
  discord_id: string;
  username: string;
  avatar: string | null;
};

export type ContainerStats = {
  cpuPercent: number;
  memUsageMB: number;
  memLimitMB: number;
};

export type ServerSessionRecord = {
  id: number;
  started_at: number;
  stopped_at: number | null;
  duration_seconds: number | null;
  stop_reason: string | null;
};

export type ServerConfig = {
  docker_image: string;
  env_vars: Record<string, string>;
};

export type BotSettings = {
  allowed_channel_id: string | null;
  commands: Array<{ name: string; description: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Auth */
  me: () => request<User>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  loginUrl: () => `${BASE}/auth/discord`,

  /** Servers */
  listServers: () => request<GameServer[]>("/servers"),
  startServer: (id: string) =>
    request<{ ok: boolean; message: string }>(`/servers/${id}/start`, { method: "POST" }),
  stopServer: (id: string) =>
    request<{ ok: boolean; message: string }>(`/servers/${id}/stop`, { method: "POST" }),

  /** Server config */
  getServerConfig: (id: string) => request<ServerConfig>(`/servers/${id}/config`),
  updateServerConfig: (id: string, config: ServerConfig) =>
    request<{ ok: boolean }>(`/servers/${id}/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  /** Session history */
  getServerHistory: (id: string) =>
    request<ServerSessionRecord[]>(`/servers/${id}/history`),

  /** Infrastructure */
  restartService: (name: "backend" | "bot") =>
    request<{ ok: boolean; message: string }>(`/services/${name}/restart`, {
      method: "POST",
    }),

  /** Bot settings */
  getBotSettings: () => request<BotSettings>("/bot/settings"),
  updateBotSettings: (settings: { allowed_channel_id: string | null }) =>
    request<{ ok: boolean }>("/bot/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};

/** Create an EventSource for live logs */
export function createLogStream(serverId: string): EventSource {
  return new EventSource(`${BASE}/servers/${serverId}/logs`, { withCredentials: true });
}

/** Create an EventSource for real-time CPU/RAM stats */
export function createStatsStream(serverId: string): EventSource {
  return new EventSource(`${BASE}/servers/${serverId}/stats`, { withCredentials: true });
}

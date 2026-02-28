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
  errors_channel_id: string | null;
  crashes_channel_id: string | null;
  logs_channel_id: string | null;
  commands: Array<{ name: string; description: string }>;
};

export type DiscordChannel = {
  id: string;
  name: string;
  parent_id: string | null;
};

export type HostStats = {
  cpuPercent: number;
  memUsageMB: number;
  memTotalMB: number;
  diskUsedGB: number;
  diskTotalGB: number;
};

export type ServiceStats = {
  service: string;
  cpuPercent: number;
  memUsageMB: number;
  memLimitMB: number;
};

export type GameTemplate = {
  id: string;
  name: string;
  category: string;
  docker_image: string;
  default_port: number;
  default_env: Record<string, string>;
  default_volumes: Record<string, string>;
};

export type PanelSettings = {
  host_domain: string;
  game_memory_limit_gb: string;
  game_cpu_limit: string;
  auto_stop_hours: string;
};

export type CreateServerRequest = {
  template_id?: string;
  id?: string;
  name?: string;
  game_type?: string;
  docker_image?: string;
  port?: number;
  env_vars?: Record<string, string>;
  volumes?: Record<string, string>;
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
  updateBotSettings: (settings: Partial<Omit<BotSettings, "commands">>) =>
    request<{ ok: boolean }>("/bot/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  listChannels: () => request<DiscordChannel[]>("/bot/channels"),

  /** Game catalog */
  getCatalog: (search?: string) =>
    request<GameTemplate[]>(`/servers/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`),

  /** Create / delete servers */
  createServer: (data: CreateServerRequest) =>
    request<{ ok: boolean }>("/servers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>(`/servers/${id}`, { method: "DELETE" }),

  /** Panel settings */
  getSettings: () => request<PanelSettings>("/settings"),
  updateSettings: (settings: Partial<PanelSettings>) =>
    request<{ ok: boolean }>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  /** Error reporting */
  reportError: (data: { message: string; stack?: string; url?: string; component?: string }) =>
    request<{ ok: boolean }>("/notifications/error", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

/** Create an EventSource for live game server logs */
export function createLogStream(serverId: string): EventSource {
  return new EventSource(`${BASE}/servers/${serverId}/logs`, { withCredentials: true });
}

/** Create an EventSource for real-time CPU/RAM stats */
export function createStatsStream(serverId: string): EventSource {
  return new EventSource(`${BASE}/servers/${serverId}/stats`, { withCredentials: true });
}

/** Create an EventSource for host-level stats */
export function createHostStatsStream(): EventSource {
  return new EventSource(`${BASE}/services/host/stats`, { withCredentials: true });
}

/** Create a multiplexed EventSource for all compose service stats */
export function createAllServiceStatsStream(): EventSource {
  return new EventSource(`${BASE}/services/stats`, { withCredentials: true });
}

/** Create an EventSource for compose service logs */
export function createServiceLogStream(name: string): EventSource {
  return new EventSource(`${BASE}/services/${name}/logs`, { withCredentials: true });
}

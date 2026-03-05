const BASE = "/api";

export type ServerStatus = "running" | "stopped" | "missing";

export type GameServer = {
  id: string;
  name: string;
  game_type: string;
  docker_image: string;
  port: number;
  status: ServerStatus;
  banner_path?: string | null;
  accent_color?: string | null;
  icon?: string | null;
};

export type User = {
  discord_id: string;
  username: string;
  avatar: string | null;
  status: "pending" | "approved" | "rejected";
};

export type PanelUser = {
  discord_id: string;
  username: string;
  avatar: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: number;
  approved_at: number | null;
  approved_by: string | null;
};

export type ContainerStats = {
  cpuPercent: number;
  cpuCores: number;
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
  name: string;
  port: number;
  docker_image: string;
  env_vars: Record<string, string>;
  volumes: Record<string, string>;
  banner_path: string | null;
  accent_color: string | null;
};

export type BotSettings = {
  allowed_channel_id: string | null;
  errors_channel_id: string | null;
  crashes_channel_id: string | null;
  logs_channel_id: string | null;
  quests_channel_id: string | null;
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
  icon: string;
  docker_image: string;
  default_port: number;
  default_env: Record<string, string>;
  default_volumes: Record<string, string>;
};

export type BackupRecord = {
  id: number;
  server_id: string;
  filename: string;
  size_bytes: number;
  created_at: number;
};

export type PanelSettings = {
  host_domain: string;
  game_memory_limit_gb: string;
  game_cpu_limit: string;
  auto_stop_hours: string;
  max_backups_per_server: string;
  auto_backup_interval_hours: string;
};

export type McpTokenRecord = {
  id: number;
  token_preview: string;
  player_name: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
};

export type PlayersResponse = {
  online: string[];
  count: number;
  max: number;
};

export type CommandResponse = {
  output: string;
};

export type CurseForgeModpack = {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  thumbnailUrl: string | null;
};

export type FileEntry = {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
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
  icon?: string;
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
  getServerHistory: (id: string) => request<ServerSessionRecord[]>(`/servers/${id}/history`),

  /** Minecraft: online players */
  getPlayers: (id: string) => request<PlayersResponse>(`/servers/${id}/players`),

  /** Minecraft: execute RCON command */
  sendCommand: (id: string, command: string) =>
    request<CommandResponse>(`/servers/${id}/command`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

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
    request<GameTemplate[]>(
      `/servers/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),

  /** Create / delete servers */
  createServer: (data: CreateServerRequest) =>
    request<{ ok: boolean }>("/servers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteServer: (id: string, deleteFiles = false) =>
    request<{ ok: boolean }>(`/servers/${id}${deleteFiles ? "?deleteFiles=true" : ""}`, {
      method: "DELETE",
    }),

  /** Backups */
  listAllBackups: () => request<BackupRecord[]>("/servers/backups/all"),
  listBackups: (serverId: string) => request<BackupRecord[]>(`/servers/${serverId}/backups`),
  createBackup: (serverId: string) =>
    request<BackupRecord>(`/servers/${serverId}/backups`, { method: "POST" }),
  restoreBackup: (serverId: string, backupId: number) =>
    request<{ ok: boolean; message: string }>(`/servers/${serverId}/backups/${backupId}/restore`, {
      method: "POST",
    }),
  deleteBackup: (serverId: string, backupId: number) =>
    request<{ ok: boolean }>(`/servers/${serverId}/backups/${backupId}`, { method: "DELETE" }),
  downloadBackupUrl: (serverId: string, backupId: number) =>
    `${BASE}/servers/${serverId}/backups/${backupId}/download`,

  /** Panel settings */
  getSettings: () => request<PanelSettings>("/settings"),
  updateSettings: (settings: Partial<PanelSettings>) =>
    request<{ ok: boolean }>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  /** Theme / banner */
  uploadBanner: async (
    serverId: string,
    file: File,
  ): Promise<{ ok: boolean; banner_path: string }> => {
    const form = new FormData();
    form.append("banner", file);
    const res = await fetch(`${BASE}/servers/${serverId}/banner`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error: string }).error ?? res.statusText);
    }
    return res.json() as Promise<{ ok: boolean; banner_path: string }>;
  },
  deleteBanner: (serverId: string) =>
    request<{ ok: boolean }>(`/servers/${serverId}/banner`, { method: "DELETE" }),
  getBannerUrl: (serverId: string) => `${BASE}/servers/${serverId}/banner`,

  /** File manager */
  listFiles: (serverId: string, path: string) =>
    request<FileEntry[]>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`),
  downloadFileUrl: (serverId: string, path: string) =>
    `${BASE}/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`,
  uploadFiles: async (
    serverId: string,
    path: string,
    files: File[],
  ): Promise<{ ok: boolean; uploaded: string[] }> => {
    const form = new FormData();
    for (const file of files) {
      form.append("file", file);
    }
    const res = await fetch(
      `${BASE}/servers/${serverId}/files/upload?path=${encodeURIComponent(path)}`,
      { method: "POST", credentials: "include", body: form },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error: string }).error ?? res.statusText);
    }
    return res.json() as Promise<{ ok: boolean; uploaded: string[] }>;
  },
  deleteFile: (serverId: string, path: string) =>
    request<{ ok: boolean }>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),
  createDirectory: (serverId: string, path: string) =>
    request<{ ok: boolean }>(`/servers/${serverId}/files/mkdir?path=${encodeURIComponent(path)}`, {
      method: "POST",
    }),

  /** CurseForge */
  searchCurseForge: (q: string) =>
    request<CurseForgeModpack[]>(`/curseforge/search?q=${encodeURIComponent(q)}`),

  /** Error reporting */
  reportError: (data: { message: string; stack?: string; url?: string; component?: string }) =>
    request<{ ok: boolean }>("/notifications/error", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** User management */
  listUsers: () => request<PanelUser[]>("/users"),
  approveUser: (id: string) => request<{ ok: boolean }>(`/users/${id}/approve`, { method: "PUT" }),
  rejectUser: (id: string) => request<{ ok: boolean }>(`/users/${id}/reject`, { method: "PUT" }),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),

  /** MCP tokens */
  listMcpTokens: () => request<McpTokenRecord[]>("/mcp-tokens"),
  createMcpToken: (data: { player_name: string; label?: string }) =>
    request<{ token: string; player_name: string }>("/mcp-tokens", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteMcpToken: (id: number) =>
    request<{ ok: boolean }>(`/mcp-tokens/${id}`, { method: "DELETE" }),
};

/** Upload a single file with progress tracking via XHR */
export function uploadFileWithProgress(
  serverId: string,
  path: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): { promise: Promise<{ ok: boolean; uploaded: string[] }>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ ok: boolean; uploaded: string[] }>((resolve, reject) => {
    xhr.open("POST", `${BASE}/servers/${serverId}/files/upload?path=${encodeURIComponent(path)}`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ ok: true, uploaded: [file.name] });
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

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

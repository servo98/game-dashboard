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
};

/** Create an EventSource for live logs */
export function createLogStream(serverId: string): EventSource {
  return new EventSource(`${BASE}/servers/${serverId}/logs`, { withCredentials: true });
}

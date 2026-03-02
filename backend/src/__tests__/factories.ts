import type { Backup, Server, ServerSession, Session } from "../db";

export function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: "minecraft",
    name: "Minecraft",
    game_type: "sandbox",
    docker_image: "itzg/minecraft-server",
    port: 25565,
    env_vars: JSON.stringify({ EULA: "TRUE" }),
    volumes: JSON.stringify({ "/data/minecraft": "/data" }),
    created_at: 1700000000,
    banner_path: null,
    accent_color: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    token: "valid-token",
    discord_id: "123456",
    username: "testuser",
    avatar: null,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

export function makeServerSession(overrides: Partial<ServerSession> = {}): ServerSession {
  return {
    id: 1,
    server_id: "minecraft",
    started_at: 1700000000,
    stopped_at: null,
    stop_reason: null,
    ...overrides,
  };
}

export function makeBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    id: 1,
    server_id: "minecraft",
    filename: "minecraft-20260101-120000.tar.gz",
    size_bytes: 1024 * 1024,
    created_at: 1700000000,
    ...overrides,
  };
}

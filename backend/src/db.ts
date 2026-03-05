import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, "../../game-panel.db");

export const db = new Database(DB_PATH, { create: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game_type TEXT NOT NULL,
    docker_image TEXT NOT NULL,
    port INTEGER NOT NULL,
    env_vars TEXT NOT NULL DEFAULT '{}',
    volumes TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    stopped_at INTEGER,
    stop_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS panel_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Panel users table (access management)
db.exec(`
  CREATE TABLE IF NOT EXISTS panel_users (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
    approved_at INTEGER,
    approved_by TEXT
  );
`);

// MCP tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    discord_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    player_name TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at INTEGER
  );
`);

// Migration: add theme columns to servers
try {
  db.exec(`ALTER TABLE servers ADD COLUMN banner_path TEXT`);
} catch (_) {
  /* column already exists */
}
try {
  db.exec(`ALTER TABLE servers ADD COLUMN accent_color TEXT`);
} catch (_) {
  /* column already exists */
}
try {
  db.exec(`ALTER TABLE servers ADD COLUMN icon TEXT`);
} catch (_) {
  /* column already exists */
}

export type Server = {
  id: string;
  name: string;
  game_type: string;
  docker_image: string;
  port: number;
  env_vars: string;
  volumes: string;
  created_at: number;
  banner_path: string | null;
  accent_color: string | null;
  icon: string | null;
};

export type Session = {
  token: string;
  discord_id: string;
  username: string;
  avatar: string | null;
  expires_at: number;
};

export type ServerSession = {
  id: number;
  server_id: string;
  started_at: number;
  stopped_at: number | null;
  stop_reason: string | null;
};

export const serverQueries = {
  getAll: db.query<Server, []>("SELECT * FROM servers ORDER BY created_at ASC"),
  getById: db.query<Server, [string]>("SELECT * FROM servers WHERE id = ?"),
  insert: db.query<void, [string, string, string, string, number, string, string, string | null]>(
    "INSERT INTO servers (id, name, game_type, docker_image, port, env_vars, volumes, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  deleteById: db.query<void, [string]>("DELETE FROM servers WHERE id = ?"),
  update: db.query<void, [string, number, string, string, string, string]>(
    "UPDATE servers SET name = ?, port = ?, docker_image = ?, env_vars = ?, volumes = ? WHERE id = ?",
  ),
  updateTheme: db.query<void, [string | null, string | null, string]>(
    "UPDATE servers SET banner_path = ?, accent_color = ? WHERE id = ?",
  ),
};

export const sessionQueries = {
  get: db.query<Session, [string]>(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > unixepoch()",
  ),
  insert: db.query<void, [string, string, string, string | null, number]>(
    "INSERT OR REPLACE INTO sessions (token, discord_id, username, avatar, expires_at) VALUES (?, ?, ?, ?, ?)",
  ),
  delete: db.query<void, [string]>("DELETE FROM sessions WHERE token = ?"),
  cleanup: db.query<void, []>("DELETE FROM sessions WHERE expires_at <= unixepoch()"),
};

export const serverSessionQueries = {
  start: db.query<void, [string, number]>(
    "INSERT INTO server_sessions (server_id, started_at) VALUES (?, ?)",
  ),
  stop: db.query<void, [number, string, string]>(
    "UPDATE server_sessions SET stopped_at = ?, stop_reason = ? WHERE server_id = ? AND stopped_at IS NULL",
  ),
  history: db.query<ServerSession, [string]>(
    "SELECT * FROM server_sessions WHERE server_id = ? ORDER BY started_at DESC LIMIT 10",
  ),
  deleteByServerId: db.query<void, [string]>("DELETE FROM server_sessions WHERE server_id = ?"),
};

export type Backup = {
  id: number;
  server_id: string;
  filename: string;
  size_bytes: number;
  created_at: number;
};

export const backupQueries = {
  listAll: db.query<Backup, []>("SELECT * FROM backups ORDER BY created_at DESC"),
  list: db.query<Backup, [string]>(
    "SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC",
  ),
  insert: db.query<void, [string, string, number, number]>(
    "INSERT INTO backups (server_id, filename, size_bytes, created_at) VALUES (?, ?, ?, ?)",
  ),
  getById: db.query<Backup, [number]>("SELECT * FROM backups WHERE id = ?"),
  deleteById: db.query<void, [number]>("DELETE FROM backups WHERE id = ?"),
  count: db.query<{ cnt: number }, [string]>(
    "SELECT COUNT(*) as cnt FROM backups WHERE server_id = ?",
  ),
  oldest: db.query<Backup, [string]>(
    "SELECT * FROM backups WHERE server_id = ? ORDER BY created_at ASC LIMIT 1",
  ),
};

export const botSettingsQueries = {
  get: db.query<{ key: string; value: string }, [string]>(
    "SELECT key, value FROM bot_settings WHERE key = ?",
  ),
  set: db.query<void, [string, string]>(
    "INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)",
  ),
  unset: db.query<void, [string]>("DELETE FROM bot_settings WHERE key = ?"),
};

const PANEL_SETTINGS_DEFAULTS: Record<string, string> = {
  host_domain: "aypapol.com",
  game_memory_limit_gb: "12",
  game_cpu_limit: "3",
  auto_stop_hours: "0",
  max_backups_per_server: "5",
  auto_backup_interval_hours: "0",
};

export const panelSettingsQueries = {
  get: db.query<{ key: string; value: string }, [string]>(
    "SELECT key, value FROM panel_settings WHERE key = ?",
  ),
  set: db.query<void, [string, string]>(
    "INSERT OR REPLACE INTO panel_settings (key, value) VALUES (?, ?)",
  ),
  getAll: db.query<{ key: string; value: string }, []>("SELECT key, value FROM panel_settings"),
};

export function getPanelSetting(key: string): string {
  const row = panelSettingsQueries.get.get(key);
  return row?.value ?? PANEL_SETTINGS_DEFAULTS[key] ?? "";
}

export function getAllPanelSettings(): Record<string, string> {
  const rows = panelSettingsQueries.getAll.all();
  const result = { ...PANEL_SETTINGS_DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export type McpToken = {
  id: number;
  token: string;
  discord_id: string;
  discord_username: string;
  player_name: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
};

export type PanelUser = {
  discord_id: string;
  username: string;
  avatar: string | null;
  status: string; // pending | approved | rejected
  requested_at: number;
  approved_at: number | null;
  approved_by: string | null;
};

export const panelUserQueries = {
  get: db.query<PanelUser, [string]>("SELECT * FROM panel_users WHERE discord_id = ?"),
  getAll: db.query<PanelUser, []>("SELECT * FROM panel_users ORDER BY requested_at DESC"),
  getByStatus: db.query<PanelUser, [string]>(
    "SELECT * FROM panel_users WHERE status = ? ORDER BY requested_at DESC",
  ),
  insert: db.query<void, [string, string, string | null, string]>(
    "INSERT OR IGNORE INTO panel_users (discord_id, username, avatar, status) VALUES (?, ?, ?, ?)",
  ),
  updateStatus: db.query<void, [string, number | null, string | null, string]>(
    "UPDATE panel_users SET status = ?, approved_at = ?, approved_by = ? WHERE discord_id = ?",
  ),
  updateProfile: db.query<void, [string, string | null, string]>(
    "UPDATE panel_users SET username = ?, avatar = ? WHERE discord_id = ?",
  ),
  delete: db.query<void, [string]>("DELETE FROM panel_users WHERE discord_id = ?"),
};

export const mcpTokenQueries = {
  getByToken: db.query<McpToken, [string]>("SELECT * FROM mcp_tokens WHERE token = ?"),
  listByDiscordId: db.query<McpToken, [string]>(
    "SELECT * FROM mcp_tokens WHERE discord_id = ? ORDER BY created_at DESC",
  ),
  listAll: db.query<McpToken, []>("SELECT * FROM mcp_tokens ORDER BY created_at DESC"),
  insert: db.query<void, [string, string, string, string, string]>(
    "INSERT INTO mcp_tokens (token, discord_id, discord_username, player_name, label) VALUES (?, ?, ?, ?, ?)",
  ),
  deleteById: db.query<void, [number, string]>(
    "DELETE FROM mcp_tokens WHERE id = ? AND discord_id = ?",
  ),
  updateLastUsed: db.query<void, [number]>(
    "UPDATE mcp_tokens SET last_used_at = unixepoch() WHERE id = ?",
  ),
};

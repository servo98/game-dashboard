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
`);

export type Server = {
  id: string;
  name: string;
  game_type: string;
  docker_image: string;
  port: number;
  env_vars: string;
  volumes: string;
  created_at: number;
};

export type Session = {
  token: string;
  discord_id: string;
  username: string;
  avatar: string | null;
  expires_at: number;
};

export const serverQueries = {
  getAll: db.query<Server, []>("SELECT * FROM servers ORDER BY created_at ASC"),
  getById: db.query<Server, [string]>("SELECT * FROM servers WHERE id = ?"),
  insert: db.query<void, [string, string, string, string, number, string, string]>(
    "INSERT OR REPLACE INTO servers (id, name, game_type, docker_image, port, env_vars, volumes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
};

export const sessionQueries = {
  get: db.query<Session, [string]>(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > unixepoch()"
  ),
  insert: db.query<void, [string, string, string, string | null, number]>(
    "INSERT OR REPLACE INTO sessions (token, discord_id, username, avatar, expires_at) VALUES (?, ?, ?, ?, ?)"
  ),
  delete: db.query<void, [string]>("DELETE FROM sessions WHERE token = ?"),
  cleanup: db.query<void, []>("DELETE FROM sessions WHERE expires_at <= unixepoch()"),
};

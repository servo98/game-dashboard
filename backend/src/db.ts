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

// --- Permission system tables ---

// user_server_access: which servers each user can manage
db.exec(`
  CREATE TABLE IF NOT EXISTS user_server_access (
    discord_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
    granted_by TEXT NOT NULL,
    PRIMARY KEY (discord_id, server_id)
  );
`);

// invite_links: invite links with pre-assigned server permissions
db.exec(`
  CREATE TABLE IF NOT EXISTS invite_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    server_ids TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT ''
  );
`);

// Migration: add role column to panel_users
try {
  db.exec(`ALTER TABLE panel_users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
} catch (_) {
  /* column already exists */
}

// Migration: add invoice_role column to panel_users
try {
  db.exec(`ALTER TABLE panel_users ADD COLUMN invoice_role TEXT`);
} catch (_) {
  /* column already exists */
}

// Auto-set role=admin for ALLOWED_DISCORD_IDS on startup, demote anyone removed
{
  const allowedIds = (process.env.ALLOWED_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Demote anyone who is admin but no longer in the list
  if (allowedIds.length > 0) {
    const placeholders = allowedIds.map(() => "?").join(",");
    db.exec(
      `UPDATE panel_users SET role = 'user' WHERE role = 'admin' AND discord_id NOT IN (${placeholders})`,
      allowedIds,
    );
  }
  for (const id of allowedIds) {
    db.exec(`UPDATE panel_users SET role = 'admin' WHERE discord_id = '${id}'`);
  }
}

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

// --- Invoice / billing tables ---
db.exec(`
  CREATE TABLE IF NOT EXISTS freelancer_profiles (
    discord_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    rfc TEXT,
    email TEXT,
    bank_name TEXT,
    account_holder TEXT,
    account_number TEXT,
    routing_number TEXT,
    account_type TEXT,
    currency TEXT DEFAULT 'USD',
    billed_to_name TEXT,
    billed_to_address TEXT,
    billed_to_phone TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    freelancer_discord_id TEXT NOT NULL,
    cfdi_uuid TEXT NOT NULL UNIQUE,
    emisor_rfc TEXT NOT NULL,
    emisor_nombre TEXT,
    receptor_rfc TEXT NOT NULL,
    receptor_nombre TEXT,
    subtotal REAL NOT NULL,
    total REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'MXN',
    forma_pago TEXT,
    metodo_pago TEXT,
    fecha_emision TEXT,
    fecha_timbrado TEXT,
    sello_sat TEXT,
    sello_cfdi TEXT,
    no_certificado_sat TEXT,
    cadena_original TEXT,
    timbrado_xml TEXT NOT NULL,
    timbrado_pdf BLOB NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    uploaded_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    clave_prod_serv TEXT,
    descripcion TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    clave_unidad TEXT,
    unidad TEXT,
    valor_unitario REAL NOT NULL,
    importe REAL NOT NULL,
    objeto_imp TEXT
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
  role: string; // admin | user
  invoice_role: string | null; // contador | freelancer | null
  requested_at: number;
  approved_at: number | null;
  approved_by: string | null;
};

export type UserServerAccess = {
  discord_id: string;
  server_id: string;
  granted_at: number;
  granted_by: string;
};

export type InviteLink = {
  id: number;
  code: string;
  server_ids: string; // JSON array
  created_by: string;
  created_at: number;
  expires_at: number | null;
  max_uses: number | null;
  use_count: number;
  label: string;
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
  updateRole: db.query<void, [string, string]>(
    "UPDATE panel_users SET role = ? WHERE discord_id = ?",
  ),
  delete: db.query<void, [string]>("DELETE FROM panel_users WHERE discord_id = ?"),
  updateInvoiceRole: db.query<void, [string | null, string]>(
    "UPDATE panel_users SET invoice_role = ? WHERE discord_id = ?",
  ),
};

export const userServerAccessQueries = {
  get: db.query<UserServerAccess, [string, string]>(
    "SELECT * FROM user_server_access WHERE discord_id = ? AND server_id = ?",
  ),
  listByUser: db.query<UserServerAccess, [string]>(
    "SELECT * FROM user_server_access WHERE discord_id = ?",
  ),
  insert: db.query<void, [string, string, string]>(
    "INSERT OR IGNORE INTO user_server_access (discord_id, server_id, granted_by) VALUES (?, ?, ?)",
  ),
  deleteByUser: db.query<void, [string]>("DELETE FROM user_server_access WHERE discord_id = ?"),
  deleteByUserAndServer: db.query<void, [string, string]>(
    "DELETE FROM user_server_access WHERE discord_id = ? AND server_id = ?",
  ),
};

export const inviteLinkQueries = {
  getByCode: db.query<InviteLink, [string]>("SELECT * FROM invite_links WHERE code = ?"),
  getById: db.query<InviteLink, [number]>("SELECT * FROM invite_links WHERE id = ?"),
  listAll: db.query<InviteLink, []>("SELECT * FROM invite_links ORDER BY created_at DESC"),
  insert: db.query<void, [string, string, string, number | null, number | null, string]>(
    "INSERT INTO invite_links (code, server_ids, created_by, expires_at, max_uses, label) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  incrementUse: db.query<void, [string]>(
    "UPDATE invite_links SET use_count = use_count + 1 WHERE code = ?",
  ),
  deleteById: db.query<void, [number]>("DELETE FROM invite_links WHERE id = ?"),
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

// --- Invoice types & queries ---

export type FreelancerProfile = {
  discord_id: string;
  display_name: string;
  rfc: string | null;
  email: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  routing_number: string | null;
  account_type: string | null;
  currency: string | null;
  billed_to_name: string | null;
  billed_to_address: string | null;
  billed_to_phone: string | null;
  updated_at: number;
};

export type Invoice = {
  id: number;
  freelancer_discord_id: string;
  cfdi_uuid: string;
  emisor_rfc: string;
  emisor_nombre: string | null;
  receptor_rfc: string;
  receptor_nombre: string | null;
  subtotal: number;
  total: number;
  moneda: string;
  forma_pago: string | null;
  metodo_pago: string | null;
  fecha_emision: string | null;
  fecha_timbrado: string | null;
  sello_sat: string | null;
  sello_cfdi: string | null;
  no_certificado_sat: string | null;
  cadena_original: string | null;
  timbrado_xml: string;
  timbrado_pdf: Buffer;
  status: string;
  created_at: number;
  uploaded_by: string;
};

export type InvoiceItem = {
  id: number;
  invoice_id: number;
  clave_prod_serv: string | null;
  descripcion: string;
  cantidad: number;
  clave_unidad: string | null;
  unidad: string | null;
  valor_unitario: number;
  importe: number;
  objeto_imp: string | null;
};

export const freelancerProfileQueries = {
  get: db.query<FreelancerProfile, [string]>(
    "SELECT * FROM freelancer_profiles WHERE discord_id = ?",
  ),
  upsert: db.query<
    void,
    [
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ]
  >(
    `INSERT INTO freelancer_profiles (discord_id, display_name, rfc, email, bank_name, account_holder, account_number, routing_number, account_type, currency, billed_to_name, billed_to_address, billed_to_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       display_name=excluded.display_name, rfc=excluded.rfc, email=excluded.email,
       bank_name=excluded.bank_name, account_holder=excluded.account_holder,
       account_number=excluded.account_number, routing_number=excluded.routing_number,
       account_type=excluded.account_type, currency=excluded.currency,
       billed_to_name=excluded.billed_to_name, billed_to_address=excluded.billed_to_address,
       billed_to_phone=excluded.billed_to_phone, updated_at=unixepoch()`,
  ),
};

// For listing invoices without the heavy BLOB columns
export type InvoiceSummary = {
  id: number;
  freelancer_discord_id: string;
  cfdi_uuid: string;
  emisor_rfc: string;
  emisor_nombre: string | null;
  receptor_rfc: string;
  receptor_nombre: string | null;
  subtotal: number;
  total: number;
  moneda: string;
  forma_pago: string | null;
  metodo_pago: string | null;
  fecha_emision: string | null;
  fecha_timbrado: string | null;
  status: string;
  created_at: number;
  uploaded_by: string;
};

const INVOICE_SUMMARY_COLS = `id, freelancer_discord_id, cfdi_uuid, emisor_rfc, emisor_nombre,
  receptor_rfc, receptor_nombre, subtotal, total, moneda, forma_pago, metodo_pago,
  fecha_emision, fecha_timbrado, status, created_at, uploaded_by`;

export const invoiceQueries = {
  insert: db.query<
    void,
    [
      string,
      string,
      string,
      string | null,
      string,
      string | null,
      number,
      number,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string,
      Buffer,
      string,
    ]
  >(
    `INSERT INTO invoices (freelancer_discord_id, cfdi_uuid, emisor_rfc, emisor_nombre,
      receptor_rfc, receptor_nombre, subtotal, total, moneda, forma_pago, metodo_pago,
      fecha_emision, fecha_timbrado, sello_sat, sello_cfdi, no_certificado_sat, cadena_original,
      timbrado_xml, timbrado_pdf, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  getById: db.query<Invoice, [number]>("SELECT * FROM invoices WHERE id = ?"),
  getByUuid: db.query<Invoice, [string]>("SELECT * FROM invoices WHERE cfdi_uuid = ?"),
  listAll: db.query<InvoiceSummary, []>(
    `SELECT ${INVOICE_SUMMARY_COLS} FROM invoices ORDER BY created_at DESC`,
  ),
  listByFreelancer: db.query<InvoiceSummary, [string]>(
    `SELECT ${INVOICE_SUMMARY_COLS} FROM invoices WHERE freelancer_discord_id = ? ORDER BY created_at DESC`,
  ),
  deleteById: db.query<void, [number]>("DELETE FROM invoices WHERE id = ?"),
  lastInsertId: db.query<{ id: number }, []>("SELECT last_insert_rowid() as id"),
};

export const invoiceItemQueries = {
  insert: db.query<
    void,
    [
      number,
      string | null,
      string,
      number,
      string | null,
      string | null,
      number,
      number,
      string | null,
    ]
  >(
    `INSERT INTO invoice_items (invoice_id, clave_prod_serv, descripcion, cantidad, clave_unidad, unidad, valor_unitario, importe, objeto_imp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  listByInvoice: db.query<InvoiceItem, [number]>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC",
  ),
};

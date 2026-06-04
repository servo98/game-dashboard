import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

// ─── Mock server-actions ────────────────────────────────────────────────────
const mockStartServer = vi.fn();
const mockStopServer = vi.fn();
const mockRestartServer = vi.fn();
const mockUpdateServerConfig = vi.fn();

vi.mock("../server-actions", () => ({
  startServer: (...a: unknown[]) => mockStartServer(...a),
  stopServer: (...a: unknown[]) => mockStopServer(...a),
  restartServer: (...a: unknown[]) => mockRestartServer(...a),
  updateServerConfig: (...a: unknown[]) => mockUpdateServerConfig(...a),
}));

// ─── Mock db ────────────────────────────────────────────────────────────────
const mockSessionGet = vi.fn();
const mockTokenGetByToken = vi.fn();
const mockServerGetById = vi.fn();
const mockPanelUserGet = vi.fn();

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  sessionQueries: { get: { get: mockSessionGet } },
  panelUserQueries: { get: { get: mockPanelUserGet } },
  mcpTokenQueries: {
    getByToken: { get: mockTokenGetByToken },
    updateLastUsed: { run: vi.fn() },
  },
  serverQueries: {
    getAll: { all: vi.fn(() => []) },
    getById: { get: mockServerGetById },
  },
}));

// An approved admin panel_user matching the session's discord_id ("123456").
const ADMIN_USER = { discord_id: "123456", status: "approved", role: "admin" };

// ─── Mock docker ────────────────────────────────────────────────────────────
const mockGetContainerStatus = vi.fn().mockResolvedValue("running" as const);
vi.mock("../docker", () => ({
  getRunningGameServers: vi.fn().mockResolvedValue([]),
  getContainerStatus: (...a: unknown[]) => mockGetContainerStatus(...a),
}));

// ─── Mock backup ────────────────────────────────────────────────────────────
const mockCreateBackup = vi.fn().mockResolvedValue({ id: 1 });
vi.mock("../backup", () => ({
  createBackup: (...a: unknown[]) => mockCreateBackup(...a),
}));

// Avoid pulling the heavy minecraft adapter machinery
vi.mock("../adapters/minecraft/index", () => ({
  createMinecraftAdapter: vi.fn().mockResolvedValue(null),
}));

const { default: mcpRoute } = await import("./mcp");

const session = makeSession();

// Helpers to drive the MCP JSON-RPC over the streamable HTTP transport.
const HEADERS_BASE = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  origin: "https://claude.ai",
};

async function rpc(auth: string, body: unknown) {
  const res = await mcpRoute.request("/mcp", {
    method: "POST",
    headers: { ...HEADERS_BASE, Authorization: auth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // The transport responds with SSE framing — extract the JSON data line.
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  const json = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);
  return { status: res.status, json };
}

const ADMIN_TOOLS = [
  "start_server",
  "stop_server",
  "restart_server",
  "update_server_env",
  "update_server_image",
];

describe("MCP admin tools — gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainerStatus.mockResolvedValue("running");
  });

  it("lists the five admin tools with a valid ADMIN session bearer token", async () => {
    mockSessionGet.mockReturnValue(session);
    mockTokenGetByToken.mockReturnValue(undefined);
    mockPanelUserGet.mockReturnValue(ADMIN_USER);

    const { status, json } = await rpc("Bearer session-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(status).toBe(200);
    const names = (json.result.tools as { name: string }[]).map((t) => t.name);
    for (const t of ADMIN_TOOLS) expect(names).toContain(t);
  });

  it("rejects a logged-in NON-admin session at the endpoint (401, privilege boundary)", async () => {
    // A valid, non-expired session exists, but the user is an approved 'user' (not admin)
    // and presents no MCP token → isAdmin() is false, so the endpoint denies access entirely.
    mockSessionGet.mockReturnValue(session);
    mockTokenGetByToken.mockReturnValue(undefined);
    mockPanelUserGet.mockReturnValue({ discord_id: "123456", status: "approved", role: "user" });

    const { status, json } = await rpc("Bearer session-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(status).toBe(401);
    expect(json.result).toBeUndefined();
  });

  it("rejects a pending (unapproved) session at the endpoint (401)", async () => {
    mockSessionGet.mockReturnValue(session);
    mockTokenGetByToken.mockReturnValue(undefined);
    mockPanelUserGet.mockReturnValue({ discord_id: "123456", status: "pending", role: "user" });

    const { status } = await rpc("Bearer session-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(status).toBe(401);
  });

  it("hides admin tools for plain MCP token (no session)", async () => {
    mockSessionGet.mockReturnValue(undefined);
    mockTokenGetByToken.mockReturnValue({
      id: 1,
      token: "mcp-token",
      discord_id: "1",
      discord_username: "u",
      player_name: "p",
      label: "",
      created_at: 0,
      last_used_at: null,
    });

    const { json } = await rpc("Bearer mcp-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const names = (json.result.tools as { name: string }[]).map((t) => t.name);
    for (const t of ADMIN_TOOLS) expect(names).not.toContain(t);
  });

  it("rejects calling start_server with only an MCP token (method not found)", async () => {
    mockSessionGet.mockReturnValue(undefined);
    mockTokenGetByToken.mockReturnValue({
      id: 1,
      token: "mcp-token",
      discord_id: "1",
      discord_username: "u",
      player_name: "p",
      label: "",
      created_at: 0,
      last_used_at: null,
    });

    const { json } = await rpc("Bearer mcp-token", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "start_server", arguments: { server_id: "minecraft" } },
    });
    // Unknown tool → either a JSON-RPC error or a tool error result; must NOT invoke the service.
    expect(mockStartServer).not.toHaveBeenCalled();
    const isError = !!json.error || json.result?.isError === true;
    expect(isError).toBe(true);
  });
});

describe("MCP admin tools — behavior (admin session)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockTokenGetByToken.mockReturnValue(undefined);
    mockPanelUserGet.mockReturnValue(ADMIN_USER);
    mockServerGetById.mockReturnValue(makeServer());
    mockGetContainerStatus.mockResolvedValue("running");
  });

  async function callTool(name: string, args: Record<string, unknown>) {
    const { json } = await rpc("Bearer session-token", {
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const text = json.result.content[0].text as string;
    return JSON.parse(text);
  }

  it("start_server forwards to startServer and returns success", async () => {
    mockStartServer.mockResolvedValue({
      ok: true,
      data: { serverId: "minecraft", image: "itzg/minecraft-server:java21" },
    });
    const payload = await callTool("start_server", { server_id: "minecraft" });
    expect(mockStartServer).toHaveBeenCalledWith("minecraft");
    expect(payload.success).toBe(true);
    expect(payload.data.image).toBe("itzg/minecraft-server:java21");
  });

  it("update_server_env forwards a delete patch for null values", async () => {
    mockUpdateServerConfig.mockResolvedValue({
      ok: true,
      data: { env_vars: { EULA: "TRUE" }, docker_image: "img" },
    });
    const payload = await callTool("update_server_env", {
      server_id: "minecraft",
      env: { MOTD: null },
    });
    expect(mockUpdateServerConfig).toHaveBeenCalledWith(
      "minecraft",
      { env_vars: { MOTD: null } },
      { backup: true },
    );
    expect(payload.success).toBe(true);
  });

  it("update_server_image rejects an invalid ref without calling the service", async () => {
    const payload = await callTool("update_server_image", {
      server_id: "minecraft",
      image: "NOT A VALID IMAGE!!",
    });
    expect(mockUpdateServerConfig).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Invalid image reference/);
  });

  it("stop_server skips backup + stop when already stopped", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    const payload = await callTool("stop_server", { server_id: "minecraft" });
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(payload.data.already_stopped).toBe(true);
  });

  it("stop_server delegates backup-then-stop to stopServer for a running server", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    mockStopServer.mockResolvedValue({ ok: true, data: { serverId: "minecraft" } });
    const payload = await callTool("stop_server", { server_id: "minecraft" });
    // Backup is now owned by the service layer; the tool forwards { backup: true }.
    expect(mockStopServer).toHaveBeenCalledWith("minecraft", "user", { backup: true });
    expect(payload.success).toBe(true);
  });

  it("stop_server forwards { backup: false } when backup is disabled", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    mockStopServer.mockResolvedValue({ ok: true, data: { serverId: "minecraft" } });
    await callTool("stop_server", { server_id: "minecraft", backup: false });
    expect(mockStopServer).toHaveBeenCalledWith("minecraft", "user", { backup: false });
  });
});

describe("MCP admin tools — gating via admin MCP token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No browser session, but an MCP token explicitly marked is_admin.
    mockSessionGet.mockReturnValue(undefined);
    mockTokenGetByToken.mockReturnValue({
      id: 2,
      token: "admin-mcp-token",
      discord_id: "1",
      discord_username: "u",
      player_name: "p",
      label: "",
      created_at: 0,
      last_used_at: null,
      is_admin: 1,
    });
    mockServerGetById.mockReturnValue(makeServer());
    mockGetContainerStatus.mockResolvedValue("running");
  });

  it("lists the admin tools for an is_admin MCP token", async () => {
    const { json } = await rpc("Bearer admin-mcp-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const names = (json.result.tools as { name: string }[]).map((t) => t.name);
    for (const t of ADMIN_TOOLS) expect(names).toContain(t);
  });

  it("lets an is_admin MCP token invoke start_server", async () => {
    mockStartServer.mockResolvedValue({
      ok: true,
      data: { serverId: "minecraft", image: "itzg/minecraft-server:java21" },
    });
    const { json } = await rpc("Bearer admin-mcp-token", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "start_server", arguments: { server_id: "minecraft" } },
    });
    const payload = JSON.parse(json.result.content[0].text as string);
    expect(mockStartServer).toHaveBeenCalledWith("minecraft");
    expect(payload.success).toBe(true);
  });
});

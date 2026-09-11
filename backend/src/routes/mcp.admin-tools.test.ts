import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

// ─── Mock server-actions ────────────────────────────────────────────────────
const mockStartServer = vi.fn();
const mockStopServer = vi.fn();
const mockRestartServer = vi.fn();
const mockUpdateServerConfig = vi.fn();
const mockCreateServer = vi.fn();
const mockRunningOnPort = vi.fn().mockResolvedValue([]);

vi.mock("../server-actions", () => ({
  startServer: (...a: unknown[]) => mockStartServer(...a),
  stopServer: (...a: unknown[]) => mockStopServer(...a),
  restartServer: (...a: unknown[]) => mockRestartServer(...a),
  updateServerConfig: (...a: unknown[]) => mockUpdateServerConfig(...a),
  createServer: (...a: unknown[]) => mockCreateServer(...a),
  runningOnPort: (...a: unknown[]) => mockRunningOnPort(...a),
  // La ruta valida referencias de imagen con esta constante. Si el mock la
  // omite llega undefined y el `.test()` revienta en vez de rechazar el valor.
  IMAGE_REF_RE:
    /^([a-z0-9]+([._-][a-z0-9]+)*(:[0-9]+)?\/)?[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[a-zA-Z0-9._-]+)?(@sha256:[a-f0-9]{64})?$/,
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

const { default: mcpRoute, listMcpTools } = await import("./mcp");
const { MCP_TOOL_LABELS } = await import("../mcp-catalog");

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
  "run_command",
  "start_server",
  "stop_server",
  "restart_server",
  "update_server_env",
  "update_server_image",
  "create_server",
];

describe("MCP admin tools — gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainerStatus.mockResolvedValue("running");
    mockRunningOnPort.mockResolvedValue([]);
  });

  it("lista las tools de admin con una sesión de administrador", async () => {
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
    // clearAllMocks borra llamadas, no implementaciones: sin esto el
    // ["minecraft"] de la prueba de puerto ocupado se cuela en las siguientes.
    mockRunningOnPort.mockResolvedValue([]);
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

  // ─── create_server ────────────────────────────────────────────────────────

  const CREATED = {
    id: "mi-app",
    name: "Mi App",
    game_type: "other",
    docker_image: "ghcr.io/servo98/mi-app:latest",
    port: 8095,
    volumes: { "/data/mi-app": "/data" },
    port_shared_with: [] as string[],
  };

  const NEW_ARGS = {
    id: "mi-app",
    name: "Mi App",
    image: "ghcr.io/servo98/mi-app:latest",
    port: 8095,
  };

  it("create_server da de alta el servidor sin arrancarlo por defecto", async () => {
    mockCreateServer.mockReturnValue({ ok: true, data: CREATED });

    const payload = await callTool("create_server", NEW_ARGS);

    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mi-app",
        docker_image: "ghcr.io/servo98/mi-app:latest",
        port: 8095,
      }),
    );
    expect(mockStartServer).not.toHaveBeenCalled();
    expect(payload.success).toBe(true);
    expect(payload.data.started).toBe(false);
  });

  it("create_server arranca el servidor con start=true", async () => {
    mockCreateServer.mockReturnValue({ ok: true, data: CREATED });
    mockStartServer.mockResolvedValue({
      ok: true,
      data: { serverId: "mi-app", image: "ghcr.io/servo98/mi-app:latest" },
    });

    const payload = await callTool("create_server", { ...NEW_ARGS, start: true });

    expect(mockStartServer).toHaveBeenCalledWith("mi-app");
    expect(payload.success).toBe(true);
    expect(payload.data.started).toBe(true);
  });

  it("create_server no da de alta nada si el puerto lo ocupa un server en marcha", async () => {
    mockRunningOnPort.mockResolvedValue(["minecraft"]);

    const payload = await callTool("create_server", { ...NEW_ARGS, start: true });

    expect(mockCreateServer).not.toHaveBeenCalled();
    expect(mockStartServer).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/minecraft/);
  });

  /**
   * Compartir puerto es legítimo mientras no coincidan en marcha: el panel
   * tiene dos Minecraft en el 25565. Sin start solo se avisa.
   */
  it("create_server avisa del puerto compartido pero da de alta igual", async () => {
    mockCreateServer.mockReturnValue({
      ok: true,
      data: { ...CREATED, port: 25565, port_shared_with: ["minecraft"] },
    });

    const payload = await callTool("create_server", { ...NEW_ARGS, port: 25565 });

    expect(payload.success).toBe(true);
    expect(payload.data.warnings[0]).toMatch(/minecraft/);
  });

  it("create_server propaga el error de validación sin arrancar nada", async () => {
    mockCreateServer.mockReturnValue({
      ok: false,
      code: "invalid",
      error: 'Ya existe un servidor con el id "mi-app".',
    });

    const payload = await callTool("create_server", NEW_ARGS);

    expect(mockStartServer).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Ya existe/);
  });

  it("create_server informa si el alta fue bien pero el arranque falló", async () => {
    mockCreateServer.mockReturnValue({ ok: true, data: CREATED });
    mockStartServer.mockResolvedValue({ ok: false, code: "docker", error: "no such image" });

    const payload = await callTool("create_server", { ...NEW_ARGS, start: true });

    expect(payload.success).toBe(true);
    expect(payload.data.started).toBe(false);
    expect(payload.data.warnings.join(" ")).toMatch(/no such image/);
  });

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

// ─── Catálogo para la pestaña MCP del panel ────────────────────────────
// La pestaña llegó a enseñar 7 de 18 herramientas porque la lista se escribía
// a mano. Ahora se deriva del MCP; esto vigila que la traducción no se quede
// corta cuando alguien añada una herramienta nueva.

describe("catálogo de herramientas del panel", () => {
  it("lista todas las herramientas que el MCP registra de verdad", () => {
    const tools = listMcpTools();
    expect(tools.length).toBeGreaterThanOrEqual(18);
    expect(tools.map((t) => t.name)).toContain("server_status");
  });

  it("tiene texto en castellano para cada herramienta", () => {
    const sinTraducir = listMcpTools()
      .filter((t) => !MCP_TOOL_LABELS[t.name])
      .map((t) => t.name);
    expect(sinTraducir).toEqual([]);
  });

  it("marca como admin exactamente las que el MCP esconde a una llave normal", () => {
    const admin = listMcpTools()
      .filter((t) => t.admin)
      .map((t) => t.name)
      .sort();
    expect(admin).toEqual([...ADMIN_TOOLS].sort());
  });

  it("no arrastra textos de herramientas que ya no existen", () => {
    const vivas = new Set(listMcpTools().map((t) => t.name));
    expect(Object.keys(MCP_TOOL_LABELS).filter((n) => !vivas.has(n))).toEqual([]);
  });
});

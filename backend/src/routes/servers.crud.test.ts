import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

const mockSessionGet = vi.fn();
const mockServerGetById = vi.fn();
const mockServerGetAll = vi.fn((): unknown[] => []);
const mockServerInsert = vi.fn();
const mockServerDeleteById = vi.fn();
const mockGetContainerStatus = vi.fn();
const mockDeleteByServerId = vi.fn();
const mockServerUpdate = vi.fn();
const mockUpdateMemoryLimit = vi.fn();

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  sessionQueries: {
    get: { get: mockSessionGet },
    insert: { run: vi.fn() },
    delete: { run: vi.fn() },
    cleanup: { run: vi.fn() },
  },
  serverQueries: {
    getAll: { all: mockServerGetAll },
    getById: { get: mockServerGetById },
    insert: { run: mockServerInsert },
    deleteById: { run: mockServerDeleteById },
    update: { run: mockServerUpdate },
    updateTheme: { run: vi.fn() },
    updateMemoryLimit: { run: mockUpdateMemoryLimit },
  },
  serverSessionQueries: {
    start: { run: vi.fn() },
    stop: { run: vi.fn() },
    history: { all: vi.fn(() => []) },
    deleteByServerId: { run: mockDeleteByServerId },
  },
  backupQueries: {
    listAll: { all: vi.fn(() => []) },
    list: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    getById: { get: vi.fn() },
    deleteById: { run: vi.fn() },
    count: { get: vi.fn() },
    oldest: { get: vi.fn() },
  },
  botSettingsQueries: { get: { get: vi.fn() }, set: { run: vi.fn() }, unset: { run: vi.fn() } },
  panelSettingsQueries: {
    get: { get: vi.fn() },
    set: { run: vi.fn() },
    getAll: { all: vi.fn(() => []) },
  },
  panelUserQueries: {
    get: {
      get: vi.fn(() => ({
        discord_id: "123456",
        username: "testuser",
        avatar: null,
        status: "approved",
        role: "admin",
        requested_at: 0,
        approved_at: 0,
        approved_by: null,
      })),
    },
    getAll: { all: vi.fn(() => []) },
    getByStatus: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    updateStatus: { run: vi.fn() },
    updateProfile: { run: vi.fn() },
    updateRole: { run: vi.fn() },
    delete: { run: vi.fn() },
  },
  userServerAccessQueries: {
    get: { get: vi.fn() },
    listByUser: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    deleteByUser: { run: vi.fn() },
    deleteByUserAndServer: { run: vi.fn() },
  },
  inviteLinkQueries: {
    getByCode: { get: vi.fn() },
    getById: { get: vi.fn() },
    listAll: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    incrementUse: { run: vi.fn() },
    deleteById: { run: vi.fn() },
  },
  mcpTokenQueries: {
    getByToken: { get: vi.fn() },
    listByDiscordId: { all: vi.fn(() => []) },
    listAll: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    deleteById: { run: vi.fn() },
    updateLastUsed: { run: vi.fn() },
  },
  getPanelSetting: vi.fn(() => "6"),
  getAllPanelSettings: vi.fn(() => ({})),
}));

vi.mock("../docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getRunningGameServers: vi.fn().mockResolvedValue([]),
  getContainerStatus: (...args: unknown[]) => mockGetContainerStatus(...args),
  startGameContainer: vi.fn(),
  stopGameContainer: vi.fn(),
  markIntentionalStop: vi.fn(),
  watchContainer: vi.fn(),
  streamContainerLogs: vi.fn(),
  streamContainerStats: vi.fn(),
}));

vi.mock("../catalog", () => ({
  GAME_CATALOG: [],
  findTemplate: vi.fn(),
  findTemplateByImage: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../backup", () => ({
  createBackup: vi.fn(),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

// El borrado completo tiene sus propias pruebas (server-cleanup.test.ts); aquí
// solo importa cómo traduce la ruta cada resultado a un código HTTP.
const mockDeleteServer = vi.fn();
vi.mock("../server-cleanup", () => ({
  deleteServer: (...args: unknown[]) => mockDeleteServer(...args),
  findOrphans: vi.fn(),
  removeOrphans: vi.fn(),
}));

const { default: servers } = await import("./servers");

const session = makeSession();
const server = makeServer();

describe("GET /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns servers list with status", async () => {
    mockSessionGet.mockReturnValue(session);
    mockServerGetAll.mockReturnValue([server]);
    mockGetContainerStatus.mockResolvedValue("stopped");
    const res = await servers.request("/", {
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("minecraft");
    expect(body[0].status).toBe("stopped");
  });

  it("returns empty array when no servers", async () => {
    mockSessionGet.mockReturnValue(session);
    mockServerGetAll.mockReturnValue([]);
    const res = await servers.request("/", {
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockServerGetById.mockReturnValue(undefined); // no conflict
    mockServerGetAll.mockReturnValue([]); // no port conflict
  });

  it("returns 401 without auth", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "test", name: "Test", docker_image: "img", port: 8080 }),
    });
    expect(res.status).toBe(401);
  });

  it("validates ID format — rejects uppercase", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "panel_session=valid-token" },
      body: JSON.stringify({ id: "BadId", name: "Test", docker_image: "img", port: 8080 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/minúsculas/i);
  });

  it("requires all fields for custom server (no template)", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "panel_session=valid-token" },
      body: JSON.stringify({ id: "test", name: "Test" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing required fields/);
  });

  it("allows same port on different servers (only one runs at a time)", async () => {
    mockServerGetAll.mockReturnValue([server]); // minecraft uses port 25565
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "panel_session=valid-token" },
      body: JSON.stringify({ id: "test", name: "Test", docker_image: "img", port: 25565 }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("creates server successfully", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "panel_session=valid-token" },
      body: JSON.stringify({
        id: "test-srv",
        name: "Test",
        docker_image: "img:latest",
        port: 9999,
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockServerInsert).toHaveBeenCalled();
  });

  it("detects duplicate server ID", async () => {
    mockServerGetById.mockReturnValue(server); // already exists
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "panel_session=valid-token" },
      body: JSON.stringify({ id: "minecraft", name: "MC2", docker_image: "img", port: 9999 }),
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
  });

  it("returns 404 for missing server", async () => {
    mockDeleteServer.mockResolvedValue({ ok: false, code: "not_found", error: "nope" });
    const res = await servers.request("/nonexistent", {
      method: "DELETE",
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when server is running", async () => {
    mockDeleteServer.mockResolvedValue({
      ok: false,
      code: "invalid",
      error: "Cannot delete a running server. Stop it first.",
    });
    const res = await servers.request("/minecraft", {
      method: "DELETE",
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Stop it first/);
  });

  it("returns 500 when Docker no deja quitar el contenedor", async () => {
    mockDeleteServer.mockResolvedValue({ ok: false, code: "docker", error: "boom" });
    const res = await servers.request("/minecraft", {
      method: "DELETE",
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(500);
  });

  it("deletes stopped server and reports what was removed", async () => {
    const removed = {
      container: true,
      image: "removed",
      data_removed: ["/data/minecraft"],
      data_kept: [],
      backups: { files: 2, bytes: 2048 },
      warnings: [],
    };
    mockDeleteServer.mockResolvedValue({ ok: true, data: removed });
    const res = await servers.request("/minecraft", {
      method: "DELETE",
      headers: { cookie: "panel_session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed });
    expect(mockDeleteServer).toHaveBeenCalledWith("minecraft");
  });
});

describe("RAM máxima por servidor en /:id/config", () => {
  const auth = { cookie: "panel_session=valid-token" };
  const put = (body: Record<string, unknown>) =>
    servers.request("/minecraft/config", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ docker_image: "itzg/minecraft-server", env_vars: {}, ...body }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockServerGetById.mockReturnValue(makeServer({ memory_limit_gb: 5 }));
  });

  it("GET devuelve la RAM propia y la general", async () => {
    const res = await servers.request("/minecraft/config", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.memory_limit_gb).toBe(5);
    expect(body.default_memory_limit_gb).toBe(6);
  });

  it("PUT guarda un número válido", async () => {
    const res = await put({ memory_limit_gb: 5 });
    expect(res.status).toBe(200);
    expect(mockUpdateMemoryLimit).toHaveBeenCalledWith(5, "minecraft");
  });

  it("PUT con null o vacío vuelve a la general", async () => {
    await put({ memory_limit_gb: null });
    expect(mockUpdateMemoryLimit).toHaveBeenCalledWith(null, "minecraft");
    await put({ memory_limit_gb: "" });
    expect(mockUpdateMemoryLimit).toHaveBeenLastCalledWith(null, "minecraft");
  });

  it("PUT sin el campo no lo toca", async () => {
    const res = await put({});
    expect(res.status).toBe(200);
    expect(mockUpdateMemoryLimit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 65, "abc"])("PUT rechaza %s sin guardar nada", async (value) => {
    const res = await put({ memory_limit_gb: value });
    expect(res.status).toBe(400);
    expect(mockServerUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMemoryLimit).not.toHaveBeenCalled();
  });
});

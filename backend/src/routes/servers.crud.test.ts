import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

const mockSessionGet = vi.fn();
const mockServerGetById = vi.fn();
const mockServerGetAll = vi.fn((): unknown[] => []);
const mockServerInsert = vi.fn();
const mockServerDeleteById = vi.fn();
const mockGetContainerStatus = vi.fn();
const mockDeleteByServerId = vi.fn();

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
    update: { run: vi.fn() },
    updateTheme: { run: vi.fn() },
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
  getPanelSetting: vi.fn(() => "6"),
  getAllPanelSettings: vi.fn(() => ({})),
}));

vi.mock("../docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getActiveContainer: vi.fn().mockResolvedValue(null),
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
}));

vi.mock("../backup", () => ({
  createBackup: vi.fn(),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

const { default: servers } = await import("./servers");

const session = makeSession();
const server = makeServer();

describe("GET /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns servers list with status (public, no auth needed)", async () => {
    mockServerGetAll.mockReturnValue([server]);
    mockGetContainerStatus.mockResolvedValue("stopped");
    const res = await servers.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("minecraft");
    expect(body[0].status).toBe("stopped");
  });

  it("returns empty array when no servers", async () => {
    mockServerGetAll.mockReturnValue([]);
    const res = await servers.request("/");
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
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
      body: JSON.stringify({ id: "BadId", name: "Test", docker_image: "img", port: 8080 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lowercase/i);
  });

  it("requires all fields for custom server (no template)", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
      body: JSON.stringify({ id: "test", name: "Test" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing required fields/);
  });

  it("detects port conflicts", async () => {
    mockServerGetAll.mockReturnValue([server]); // minecraft uses port 25565
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
      body: JSON.stringify({ id: "test", name: "Test", docker_image: "img", port: 25565 }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Port 25565/);
  });

  it("creates server successfully", async () => {
    const res = await servers.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
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
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
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
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/nonexistent", {
      method: "DELETE",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when server is running", async () => {
    mockServerGetById.mockReturnValue(server);
    mockGetContainerStatus.mockResolvedValue("running");
    const res = await servers.request("/minecraft", {
      method: "DELETE",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Stop it first/);
  });

  it("deletes stopped server", async () => {
    mockServerGetById.mockReturnValue(server);
    mockGetContainerStatus.mockResolvedValue("stopped");
    const res = await servers.request("/minecraft", {
      method: "DELETE",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockDeleteByServerId).toHaveBeenCalledWith("minecraft");
    expect(mockServerDeleteById).toHaveBeenCalledWith("minecraft");
  });
});

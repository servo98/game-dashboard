import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

// Mock db
const mockSessionGet = vi.fn();
const mockServerGetById = vi.fn();
const mockServerGetAll = vi.fn(() => []);
const mockSessionStart = vi.fn();
const mockSessionStop = vi.fn();

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
    insert: { run: vi.fn() },
    deleteById: { run: vi.fn() },
    update: { run: vi.fn() },
    updateTheme: { run: vi.fn() },
  },
  serverSessionQueries: {
    start: { run: mockSessionStart },
    stop: { run: mockSessionStop },
    history: { all: vi.fn(() => []) },
    deleteByServerId: { run: vi.fn() },
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

// Mock docker
const mockGetActiveContainer = vi.fn().mockResolvedValue(null);
const mockGetContainerStatus = vi.fn().mockResolvedValue("stopped" as const);
const mockStartGameContainer = vi.fn().mockResolvedValue(undefined);
const mockStopGameContainer = vi.fn().mockResolvedValue(undefined);
const mockMarkIntentionalStop = vi.fn();
const mockWatchContainer = vi.fn();

vi.mock("../docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getActiveContainer: (...args: unknown[]) => mockGetActiveContainer(...args),
  getContainerStatus: (...args: unknown[]) => mockGetContainerStatus(...args),
  startGameContainer: (...args: unknown[]) => mockStartGameContainer(...args),
  stopGameContainer: (...args: unknown[]) => mockStopGameContainer(...args),
  markIntentionalStop: (...args: unknown[]) => mockMarkIntentionalStop(...args),
  watchContainer: (...args: unknown[]) => mockWatchContainer(...args),
  streamContainerLogs: vi.fn(),
  streamContainerStats: vi.fn(),
}));

// Mock catalog
vi.mock("../catalog", () => ({
  GAME_CATALOG: [],
  findTemplate: vi.fn(),
}));

// Mock backup
vi.mock("../backup", () => ({
  createBackup: vi.fn(),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

const { default: servers } = await import("./servers");

const server = makeServer();
const session = makeSession();

describe("POST /:id/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockServerGetById.mockReturnValue(server);
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
  });

  it("returns 401 without auth", async () => {
    const res = await servers.request("/minecraft/start", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing server", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/nonexistent/start", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(404);
  });

  it("starts server with valid session cookie", async () => {
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockStartGameContainer).toHaveBeenCalledWith(
      "minecraft",
      "itzg/minecraft-server",
      25565,
      { EULA: "TRUE" },
      { "/data/minecraft": "/data" },
    );
    expect(mockSessionStart.mock.calls.length).toBe(1);
    expect(mockWatchContainer).toHaveBeenCalled();
  });

  it("starts server with bot API key", async () => {
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("stops active server before starting new one", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("valheim");
    expect(mockSessionStop).toHaveBeenCalled();
  });
});

describe("POST /:id/stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockServerGetById.mockReturnValue(server);
    mockSessionGet.mockReturnValue(session);
    mockStopGameContainer.mockResolvedValue(undefined);
  });

  it("returns 401 without auth", async () => {
    const res = await servers.request("/minecraft/stop", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("stops server with session cookie", async () => {
    const res = await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("minecraft");
    expect(mockStopGameContainer).toHaveBeenCalledWith("minecraft");
    expect(mockSessionStop).toHaveBeenCalled();
  });

  it("stops server with bot key", async () => {
    const res = await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
  });

  it("handles 'active' pseudo-id when a server is running", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "minecraft" });
    const res = await servers.request("/active/stop", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("minecraft");
    expect(mockStopGameContainer).toHaveBeenCalledWith("minecraft");
  });

  it("handles 'active' pseudo-id when no server is running", async () => {
    mockGetActiveContainer.mockResolvedValue(null);
    const res = await servers.request("/active/stop", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("No server running");
  });
});

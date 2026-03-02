import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

const mockSessionGet = vi.fn();
const mockServerGetById = vi.fn();
const mockGetContainerStatus = vi.fn();

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  sessionQueries: {
    get: { get: mockSessionGet },
    insert: { run: vi.fn() },
    delete: { run: vi.fn() },
    cleanup: { run: vi.fn() },
  },
  serverQueries: {
    getAll: { all: vi.fn(() => []) },
    getById: { get: mockServerGetById },
    insert: { run: vi.fn() },
    deleteById: { run: vi.fn() },
    update: { run: vi.fn() },
    updateTheme: { run: vi.fn() },
  },
  serverSessionQueries: {
    start: { run: vi.fn() },
    stop: { run: vi.fn() },
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

// Mock a generator that yields one line then returns
async function* fakeLogStream(_id: string, _signal: AbortSignal) {
  yield "test log line";
}

async function* fakeStatsStream(_id: string, _signal: AbortSignal) {
  yield { cpuPercent: 25, memUsageMB: 512, memLimitMB: 4096 };
}

vi.mock("../docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getActiveContainer: vi.fn().mockResolvedValue(null),
  getContainerStatus: (...args: unknown[]) => mockGetContainerStatus(...args),
  startGameContainer: vi.fn(),
  stopGameContainer: vi.fn(),
  markIntentionalStop: vi.fn(),
  watchContainer: vi.fn(),
  streamContainerLogs: (...args: unknown[]) => fakeLogStream(...(args as [string, AbortSignal])),
  streamContainerStats: (...args: unknown[]) => fakeStatsStream(...(args as [string, AbortSignal])),
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

const server = makeServer();
const session = makeSession();

describe("GET /:id/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockServerGetById.mockReturnValue(server);
  });

  it("returns 401 without auth", async () => {
    const res = await servers.request("/minecraft/logs");
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing server", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/minecraft/logs", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when server is not running", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    const res = await servers.request("/minecraft/logs", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with correct headers when running", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    const res = await servers.request("/minecraft/logs", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });
});

describe("GET /:id/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockServerGetById.mockReturnValue(server);
  });

  it("returns 401 without auth", async () => {
    const res = await servers.request("/minecraft/stats");
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing server", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/minecraft/stats", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when server is not running", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    const res = await servers.request("/minecraft/stats", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with correct headers when running", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    const res = await servers.request("/minecraft/stats", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });
});

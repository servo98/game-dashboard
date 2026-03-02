import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSession } from "../__tests__/factories";

const mockSessionGet = vi.fn();
const mockRestart = vi.fn();
const mockGetContainer = vi.fn();

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
    getById: { get: vi.fn() },
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

vi.mock("../docker", () => ({
  docker: {
    getContainer: (...args: unknown[]) => mockGetContainer(...args),
    listContainers: vi.fn().mockResolvedValue([]),
  },
  streamHostStats: vi.fn(async function* () {
    yield { cpuPercent: 10, memUsageMB: 1024, memTotalMB: 8192, diskUsedGB: 20, diskTotalGB: 40 };
  }),
  streamServiceLogs: vi.fn(async function* () {
    yield "log line";
  }),
  streamServiceStats: vi.fn(async function* () {
    yield { cpuPercent: 5, memUsageMB: 128, memLimitMB: 512 };
  }),
}));

const { default: services } = await import("./services");

const session = makeSession();

describe("POST /:name/restart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
    mockRestart.mockResolvedValue(undefined);
    mockGetContainer.mockReturnValue({ restart: mockRestart });
  });

  it("returns 401 without auth", async () => {
    const res = await services.request("/backend/restart", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects unknown service names", async () => {
    const res = await services.request("/unknown/restart", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown service/);
  });

  it("restarts valid service", async () => {
    const res = await services.request("/backend/restart", {
      method: "POST",
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockGetContainer).toHaveBeenCalledWith("game-panel-backend-1");
    expect(mockRestart).toHaveBeenCalledWith({ t: 10 });
  });

  it("allows all 4 service names", async () => {
    for (const name of ["backend", "bot", "dashboard", "nginx"]) {
      const res = await services.request(`/${name}/restart`, {
        method: "POST",
        headers: { cookie: "session=valid-token" },
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /:name/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
  });

  it("returns 401 without auth", async () => {
    const res = await services.request("/backend/logs");
    expect(res.status).toBe(401);
  });

  it("rejects unknown service names", async () => {
    const res = await services.request("/badname/logs", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(400);
  });

  it("returns SSE for valid service", async () => {
    const res = await services.request("/backend/logs", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSession } from "../__tests__/factories";

const mockSessionGet = vi.fn();
const mockGetAllPanelSettings = vi.fn();
const mockPanelSettingsSet = vi.fn();

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
    set: { run: mockPanelSettingsSet },
    getAll: { all: vi.fn(() => []) },
  },
  getPanelSetting: vi.fn(() => "6"),
  getAllPanelSettings: (...args: unknown[]) => mockGetAllPanelSettings(...args),
}));

const { default: settings } = await import("./settings");

const session = makeSession();

describe("GET /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetAllPanelSettings.mockReturnValue({
      host_domain: "example.com",
      game_memory_limit_gb: "6",
      game_cpu_limit: "3",
      auto_stop_hours: "0",
      max_backups_per_server: "5",
      auto_backup_interval_hours: "0",
    });
  });

  it("returns 401 without auth or bot key", async () => {
    const res = await settings.request("/");
    expect(res.status).toBe(401);
  });

  it("returns settings with valid session", async () => {
    const res = await settings.request("/", {
      headers: { cookie: "session=valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.host_domain).toBe("example.com");
  });

  it("returns settings with bot key", async () => {
    const res = await settings.request("/", {
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
  });
});

describe("PUT /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(session);
  });

  it("returns 401 without auth", async () => {
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host_domain: "new.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("saves allowed keys", async () => {
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
      body: JSON.stringify({ host_domain: "new.com", game_memory_limit_gb: "8" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockPanelSettingsSet).toHaveBeenCalledWith("host_domain", "new.com");
    expect(mockPanelSettingsSet).toHaveBeenCalledWith("game_memory_limit_gb", "8");
  });

  it("ignores unknown keys", async () => {
    const res = await settings.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: "session=valid-token" },
      body: JSON.stringify({ host_domain: "ok.com", evil_key: "hack" }),
    });
    expect(res.status).toBe(200);
    expect(mockPanelSettingsSet).toHaveBeenCalledWith("host_domain", "ok.com");
    expect(mockPanelSettingsSet).not.toHaveBeenCalledWith("evil_key", expect.anything());
  });
});

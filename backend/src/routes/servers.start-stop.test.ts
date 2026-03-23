import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer, makeSession } from "../__tests__/factories";

// Suppress expected console.error from error-handling tests (F5/F6/G2/I2/I3)
const originalConsoleError = console.error;
afterEach(() => {
  console.error = originalConsoleError;
});
function silenceConsole() {
  console.error = vi.fn();
}

// Mock db
const mockSessionGet = vi.fn();
const mockServerGetById = vi.fn();
const mockServerGetAll = vi.fn(() => []);
const mockSessionStart = vi.fn();
const mockSessionStop = vi.fn();
const mockServerUpdate = vi.fn();

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
    update: { run: mockServerUpdate },
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
const mockFindTemplateByImage = vi.fn();
vi.mock("../catalog", () => ({
  GAME_CATALOG: [],
  findTemplate: vi.fn(),
  findTemplateByImage: (...args: unknown[]) => mockFindTemplateByImage(...args),
}));

// Mock backup
vi.mock("../backup", () => ({
  createBackup: vi.fn(),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

// Mock joinable-status
const mockBeginLogWatching = vi.fn();
const mockStopJoinableWatcher = vi.fn();
const mockGetJoinableStatus = vi.fn().mockReturnValue(null);
vi.mock("../joinable-status", () => ({
  beginLogWatching: (...args: unknown[]) => mockBeginLogWatching(...args),
  stopJoinableWatcher: (...args: unknown[]) => mockStopJoinableWatcher(...args),
  getJoinableStatus: (...args: unknown[]) => mockGetJoinableStatus(...args),
}));

const { default: servers } = await import("./servers");

const server = makeServer();
const session = makeSession();

// ─── Existing tests ────────────────────────────────────────────────

describe("POST /:id/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockServerGetById.mockReturnValue(server);
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
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
      "itzg/minecraft-server:java21",
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

// ─── A: Java Image Tag Selection (13 tests) ───────────────────────

describe("A — Java Image Tag Selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  const startWith = (overrides: Parameters<typeof makeServer>[0]) => {
    const s = makeServer(overrides);
    mockServerGetById.mockReturnValue(s);
    return servers.request(`/${s.id}/start`, {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
  };

  const expectImage = (image: string) =>
    expect(mockStartGameContainer).toHaveBeenCalledWith(
      expect.any(String),
      image,
      expect.any(Number),
      expect.any(Object),
      expect.any(Object),
    );

  it("A1: respects explicit :java21 tag", async () => {
    await startWith({ docker_image: "itzg/minecraft-server:java21" });
    expectImage("itzg/minecraft-server:java21");
  });

  it("A2: respects explicit :java17 tag", async () => {
    await startWith({ docker_image: "itzg/minecraft-server:java17" });
    expectImage("itzg/minecraft-server:java17");
  });

  it("A3: respects explicit :java8 tag", async () => {
    await startWith({ docker_image: "itzg/minecraft-server:java8" });
    expectImage("itzg/minecraft-server:java8");
  });

  it("A4: :latest tag triggers auto-detect from VERSION", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server:latest",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.4" }),
    });
    expectImage("itzg/minecraft-server:java17");
  });

  it("A5: no tag at all triggers auto-detect", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.4" }),
    });
    expectImage("itzg/minecraft-server:java17");
  });

  it("A6: VERSION=1.21.1 → java21", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.21.1" }),
    });
    expectImage("itzg/minecraft-server:java21");
  });

  it("A7: VERSION=1.20.4 → java17", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.4" }),
    });
    expectImage("itzg/minecraft-server:java17");
  });

  it("A8: VERSION=1.20.5 → java21 (boundary)", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.5" }),
    });
    expectImage("itzg/minecraft-server:java21");
  });

  it("A9: VERSION=1.16.5 → java8 (minor < 18)", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.16.5" }),
    });
    expectImage("itzg/minecraft-server:java8");
  });

  it("A10: VERSION=1.12.2 → java8", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.12.2" }),
    });
    expectImage("itzg/minecraft-server:java8");
  });

  it("A11: VERSION=LATEST → java21", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "LATEST" }),
    });
    expectImage("itzg/minecraft-server:java21");
  });

  it("A12: VERSION=SNAPSHOT → java21", async () => {
    await startWith({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "SNAPSHOT" }),
    });
    expectImage("itzg/minecraft-server:java21");
  });

  it("A13: non-itzg image passed unchanged", async () => {
    await startWith({
      id: "valheim",
      docker_image: "lloesche/valheim-server",
      game_type: "survival",
      env_vars: JSON.stringify({ SERVER_NAME: "test" }),
    });
    expectImage("lloesche/valheim-server");
  });
});

// ─── B: Modpack TYPE Handling (6 tests) ────────────────────────────

describe("B — Modpack TYPE Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  const startWith = (envOverrides: Record<string, string>) => {
    const s = makeServer({
      docker_image: "itzg/minecraft-server:java21",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.1", ...envOverrides }),
    });
    mockServerGetById.mockReturnValue(s);
    return servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
  };

  it("B1: TYPE=AUTO_CURSEFORGE → VERSION deleted", async () => {
    await startWith({ TYPE: "AUTO_CURSEFORGE", CF_SLUG: "create" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.VERSION).toBeUndefined();
    expect(envArg.TYPE).toBe("AUTO_CURSEFORGE");
  });

  it("B2: TYPE=MODRINTH → VERSION deleted", async () => {
    await startWith({ TYPE: "MODRINTH", MODRINTH_MODPACK: "cobblemon" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.VERSION).toBeUndefined();
  });

  it("B3: TYPE=FTBA → VERSION deleted", async () => {
    await startWith({ TYPE: "FTBA", FTB_MODPACK_ID: "123" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.VERSION).toBeUndefined();
  });

  it("B4: TYPE=VANILLA → VERSION preserved", async () => {
    await startWith({ TYPE: "VANILLA" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.VERSION).toBe("1.20.1");
  });

  it("B5: AUTO_CURSEFORGE + CF_API_KEY in process.env → injected", async () => {
    process.env.CF_API_KEY = "test-cf-key";
    await startWith({ TYPE: "AUTO_CURSEFORGE", CF_SLUG: "create" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.CF_API_KEY).toBe("test-cf-key");
    delete process.env.CF_API_KEY;
  });

  it("B6: TYPE=MODRINTH + CF_API_KEY in process.env → NOT leaked", async () => {
    process.env.CF_API_KEY = "test-cf-key";
    await startWith({ TYPE: "MODRINTH", MODRINTH_MODPACK: "cobblemon" });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.CF_API_KEY).toBeUndefined();
    delete process.env.CF_API_KEY;
  });
});

// ─── C: Server Switching Atomicity (7 tests) ──────────────────────

describe("C — Server Switching Atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockStopGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("C1: start B while A running → markIntentionalStop(A)", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("valheim");
  });

  it("C2: start B while A running → session closed 'replaced' for A", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "replaced", "valheim");
  });

  it("C3: restart same server → stops self then starts fresh", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "minecraft" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("minecraft");
    expect(mockStartGameContainer).toHaveBeenCalled();
  });

  it("C4: start when nothing running → stopGameContainer never called directly", async () => {
    mockGetActiveContainer.mockResolvedValue(null);
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockStopGameContainer).not.toHaveBeenCalled();
    expect(mockMarkIntentionalStop).not.toHaveBeenCalled();
  });

  it("C5: stop 'active' with running server → correct serverId + session 'user'", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "minecraft" });
    mockServerGetById.mockReturnValue(makeServer());
    const res = await servers.request("/active/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
    expect(mockStopGameContainer).toHaveBeenCalledWith("minecraft");
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "user", "minecraft");
  });

  it("C6: stop 'active' with nothing running → 200 'No server running'", async () => {
    mockGetActiveContainer.mockResolvedValue(null);
    const res = await servers.request("/active/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("No server running");
  });

  it("C7: start B while A running → stopJoinableWatcher called for A", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockStopJoinableWatcher).toHaveBeenCalledWith("valheim");
  });
});

// ─── D: Volume Auto-fix (5 tests) ─────────────────────────────────

describe("D — Volume Auto-fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
  });

  it("D1: empty volumes + catalog match → volumes remapped with server ID", async () => {
    mockFindTemplateByImage.mockReturnValue({
      id: "minecraft",
      default_volumes: { "/data/minecraft": "/data" },
    });
    const s = makeServer({ id: "mc2", volumes: JSON.stringify({}) });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/mc2/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const volumeArg = mockStartGameContainer.mock.calls[0][4] as Record<string, string>;
    expect(volumeArg).toEqual({ "/data/mc2": "/data" });
  });

  it("D2: empty volumes + catalog match → update.run called to persist", async () => {
    mockFindTemplateByImage.mockReturnValue({
      id: "minecraft",
      default_volumes: { "/data/minecraft": "/data" },
    });
    const s = makeServer({ id: "mc2", volumes: JSON.stringify({}) });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/mc2/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockServerUpdate).toHaveBeenCalled();
  });

  it("D3: empty volumes + no catalog match → fallback /data/<id>:/data", async () => {
    mockFindTemplateByImage.mockReturnValue(undefined);
    const s = makeServer({
      id: "custom",
      docker_image: "custom/image",
      volumes: JSON.stringify({}),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/custom/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const volumeArg = mockStartGameContainer.mock.calls[0][4] as Record<string, string>;
    expect(volumeArg).toEqual({ "/data/custom": "/data" });
  });

  it("D4: empty volumes + no catalog match → update.run called with fallback", async () => {
    mockFindTemplateByImage.mockReturnValue(undefined);
    const s = makeServer({
      id: "custom",
      docker_image: "custom/image",
      volumes: JSON.stringify({}),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/custom/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockServerUpdate).toHaveBeenCalled();
  });

  it("D5: non-empty volumes → preserved unchanged, update not called", async () => {
    mockFindTemplateByImage.mockReturnValue(undefined);
    const s = makeServer({ volumes: JSON.stringify({ "/data/minecraft": "/data" }) });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const volumeArg = mockStartGameContainer.mock.calls[0][4] as Record<string, string>;
    expect(volumeArg).toEqual({ "/data/minecraft": "/data" });
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });
});

// ─── E: Port Injection (4 tests) ──────────────────────────────────

describe("E — Port Injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("E1: minecraft, port=25566, no SERVER_PORT → injected", async () => {
    const s = makeServer({
      game_type: "minecraft",
      port: 25566,
      env_vars: JSON.stringify({ EULA: "TRUE" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.SERVER_PORT).toBe("25566");
  });

  it("E2: minecraft, port=25565 (default) → SERVER_PORT not injected", async () => {
    const s = makeServer({
      game_type: "minecraft",
      port: 25565,
      env_vars: JSON.stringify({ EULA: "TRUE" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.SERVER_PORT).toBeUndefined();
  });

  it("E3: non-minecraft game, port=28015 → SERVER_PORT never injected", async () => {
    const s = makeServer({
      id: "rust",
      game_type: "survival",
      port: 28015,
      docker_image: "didstopia/rust-server",
      env_vars: JSON.stringify({ RUST_SERVER_NAME: "test" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/rust/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.SERVER_PORT).toBeUndefined();
  });

  it("E4: minecraft, port=25566, SERVER_PORT already set → not overridden", async () => {
    const s = makeServer({
      game_type: "minecraft",
      port: 25566,
      env_vars: JSON.stringify({ EULA: "TRUE", SERVER_PORT: "25570" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.SERVER_PORT).toBe("25570");
  });
});

// ─── F: Session Tracking (6 tests) ────────────────────────────────

describe("F — Session Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockStopGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("F1: successful start → sessionStart called once", async () => {
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockSessionStart).toHaveBeenCalledTimes(1);
    expect(mockSessionStart).toHaveBeenCalledWith("minecraft", expect.any(Number));
  });

  it("F2: replace A with B → start(B) + stop(A, 'replaced')", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "replaced", "valheim");
    expect(mockSessionStart).toHaveBeenCalledWith("minecraft", expect.any(Number));
  });

  it("F3: successful stop → stop(timestamp, 'user', id)", async () => {
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "user", "minecraft");
  });

  it("F4: stop 'active' → stop called with active container's name", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    await servers.request("/active/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "user", "valheim");
  });

  it("F5: start fails (docker throws) → sessionStart NOT called", async () => {
    silenceConsole();
    mockStartGameContainer.mockRejectedValue(new Error("docker boom"));
    mockServerGetById.mockReturnValue(makeServer());
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(500);
    expect(mockSessionStart).not.toHaveBeenCalled();
  });

  it("F6: start fails → watchContainer NOT called", async () => {
    silenceConsole();
    mockStartGameContainer.mockRejectedValue(new Error("docker boom"));
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockWatchContainer).not.toHaveBeenCalled();
  });
});

// ─── G: Crash Watcher (4 tests) ───────────────────────────────────

describe("G — Crash Watcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockStopGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("G1: successful start → watchContainer called with serverId", async () => {
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockWatchContainer).toHaveBeenCalledWith("minecraft", expect.any(Function));
  });

  it("G2: start fails → watchContainer not called", async () => {
    silenceConsole();
    mockStartGameContainer.mockRejectedValue(new Error("fail"));
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockWatchContainer).not.toHaveBeenCalled();
  });

  it("G3: replace server → markIntentionalStop before stop", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    // markIntentionalStop must be called before session stop
    const markOrder = mockMarkIntentionalStop.mock.invocationCallOrder[0];
    const stopOrder = mockSessionStop.mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(stopOrder);
  });

  it("G4: stop by ID → markIntentionalStop before stopGameContainer", async () => {
    mockServerGetById.mockReturnValue(makeServer());
    await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("minecraft");
    const markOrder = mockMarkIntentionalStop.mock.invocationCallOrder[0];
    const stopOrder = mockStopGameContainer.mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(stopOrder);
  });
});

// ─── H: Auth Edge Cases (4 tests) ─────────────────────────────────

describe("H — Auth Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockServerGetById.mockReturnValue(makeServer());
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockStopGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("H1: start with Bearer token header → 200", async () => {
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
  });

  it("H2: start with wrong bot key → 401", async () => {
    mockSessionGet.mockReturnValue(undefined);
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("H3: start with empty bot key → 401", async () => {
    mockSessionGet.mockReturnValue(undefined);
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "" },
    });
    expect(res.status).toBe(401);
  });

  it("H4: stop with Bearer token header → 200", async () => {
    const res = await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
  });
});

// ─── I: Error Handling (4 tests) ──────────────────────────────────

describe("I — Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("I1: start non-existent server → 404", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/nonexistent/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(404);
  });

  it("I2: startGameContainer throws → 500", async () => {
    silenceConsole();
    mockServerGetById.mockReturnValue(makeServer());
    mockStartGameContainer.mockRejectedValue(new Error("container create failed"));
    const res = await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to start server");
  });

  it("I3: stopGameContainer throws → 500", async () => {
    silenceConsole();
    mockServerGetById.mockReturnValue(makeServer());
    mockStopGameContainer.mockRejectedValue(new Error("container stop failed"));
    const res = await servers.request("/minecraft/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to stop server");
  });

  it("I4: stop non-existent server → 404", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const res = await servers.request("/nonexistent/stop", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(404);
  });
});

// ─── J: Env Var Passthrough (2 tests) ─────────────────────────────

describe("J — Env Var Passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    mockSessionGet.mockReturnValue(session);
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  it("J1: env var with ${PLACEHOLDER} → passed through raw to startGameContainer", async () => {
    const s = makeServer({
      env_vars: JSON.stringify({ EULA: "TRUE", RCON_PASSWORD: "${RCON_SECRET}" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    // Placeholder should be in the env — docker.ts resolves it, not servers.ts
    expect(envArg.RCON_PASSWORD).toBe("${RCON_SECRET}");
  });

  it("J2: env var without placeholder → passed unchanged", async () => {
    const s = makeServer({
      env_vars: JSON.stringify({ EULA: "TRUE", MOTD: "Hello World" }),
    });
    mockServerGetById.mockReturnValue(s);
    await servers.request("/minecraft/start", {
      method: "POST",
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    const envArg = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(envArg.MOTD).toBe("Hello World");
  });
});

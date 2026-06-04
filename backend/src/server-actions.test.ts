import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer } from "./__tests__/factories";

const originalConsoleError = console.error;
afterEach(() => {
  console.error = originalConsoleError;
});
function silenceConsole() {
  console.error = vi.fn();
}

// ─── Mock db ──────────────────────────────────────────────────────────────────
const mockServerGetById = vi.fn();
const mockSessionStart = vi.fn();
const mockSessionStop = vi.fn();
const mockServerUpdate = vi.fn();

vi.mock("./db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  serverQueries: {
    getAll: { all: vi.fn(() => []) },
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
  botSettingsQueries: { get: { get: vi.fn() }, set: { run: vi.fn() }, unset: { run: vi.fn() } },
  getPanelSetting: vi.fn(() => "6"),
}));

// ─── Mock docker ──────────────────────────────────────────────────────────────
const mockGetActiveContainer = vi.fn().mockResolvedValue(null);
const mockGetContainerStatus = vi.fn().mockResolvedValue("stopped" as const);
const mockStartGameContainer = vi.fn().mockResolvedValue(undefined);
const mockStopGameContainer = vi.fn().mockResolvedValue(undefined);
const mockMarkIntentionalStop = vi.fn();
const mockWatchContainer = vi.fn();

vi.mock("./docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getActiveContainer: (...args: unknown[]) => mockGetActiveContainer(...args),
  getContainerStatus: (...args: unknown[]) => mockGetContainerStatus(...args),
  startGameContainer: (...args: unknown[]) => mockStartGameContainer(...args),
  stopGameContainer: (...args: unknown[]) => mockStopGameContainer(...args),
  markIntentionalStop: (...args: unknown[]) => mockMarkIntentionalStop(...args),
  watchContainer: (...args: unknown[]) => mockWatchContainer(...args),
}));

// ─── Mock catalog ─────────────────────────────────────────────────────────────
const mockFindTemplateByImage = vi.fn();
vi.mock("./catalog", () => ({
  GAME_CATALOG: [],
  findTemplate: vi.fn(),
  findTemplateByImage: (...args: unknown[]) => mockFindTemplateByImage(...args),
}));

// ─── Mock backup ──────────────────────────────────────────────────────────────
const mockCreateBackup = vi.fn().mockResolvedValue({ id: 1 });
vi.mock("./backup", () => ({
  createBackup: (...args: unknown[]) => mockCreateBackup(...args),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

// ─── Mock joinable-status ─────────────────────────────────────────────────────
const mockBeginLogWatching = vi.fn();
const mockStopJoinableWatcher = vi.fn();
vi.mock("./joinable-status", () => ({
  beginLogWatching: (...args: unknown[]) => mockBeginLogWatching(...args),
  stopJoinableWatcher: (...args: unknown[]) => mockStopJoinableWatcher(...args),
  getJoinableStatus: vi.fn(() => null),
}));

const { startServer, stopServer, updateServerConfig, restartServer } = await import(
  "./server-actions"
);

// ─── startServer ──────────────────────────────────────────────────────────────

describe("startServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveContainer.mockResolvedValue(null);
    mockStartGameContainer.mockResolvedValue(undefined);
    mockFindTemplateByImage.mockReturnValue(undefined);
  });

  const start = (overrides: Parameters<typeof makeServer>[0]) => {
    const s = makeServer(overrides);
    mockServerGetById.mockReturnValue(s);
    return startServer(s.id);
  };

  it("returns not_found when server missing", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const r = await startServer("ghost");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_found");
  });

  // A — Java tag selection
  it("A1: respects explicit :java21 tag", async () => {
    const r = await start({ docker_image: "itzg/minecraft-server:java21" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.image).toBe("itzg/minecraft-server:java21");
    expect(mockStartGameContainer.mock.calls[0][1]).toBe("itzg/minecraft-server:java21");
  });

  it("A5: no tag → auto-detect from VERSION (1.20.4 → java17)", async () => {
    await start({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.4" }),
    });
    expect(mockStartGameContainer.mock.calls[0][1]).toBe("itzg/minecraft-server:java17");
  });

  it("A8: VERSION=1.20.5 → java21 (boundary)", async () => {
    await start({
      docker_image: "itzg/minecraft-server",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.5" }),
    });
    expect(mockStartGameContainer.mock.calls[0][1]).toBe("itzg/minecraft-server:java21");
  });

  it("A13: non-itzg image passed unchanged", async () => {
    await start({
      id: "valheim",
      docker_image: "lloesche/valheim-server",
      game_type: "survival",
      env_vars: JSON.stringify({ SERVER_NAME: "x" }),
    });
    expect(mockStartGameContainer.mock.calls[0][1]).toBe("lloesche/valheim-server");
  });

  // B — modpack VERSION delete
  it("B1: TYPE=AUTO_CURSEFORGE → VERSION deleted", async () => {
    await start({
      docker_image: "itzg/minecraft-server:java21",
      env_vars: JSON.stringify({ EULA: "TRUE", VERSION: "1.20.1", TYPE: "AUTO_CURSEFORGE" }),
    });
    const env = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(env.VERSION).toBeUndefined();
    expect(env.TYPE).toBe("AUTO_CURSEFORGE");
  });

  it("B5: AUTO_CURSEFORGE + CF_API_KEY in env → injected", async () => {
    process.env.CF_API_KEY = "cf-key";
    await start({
      docker_image: "itzg/minecraft-server:java21",
      env_vars: JSON.stringify({ EULA: "TRUE", TYPE: "AUTO_CURSEFORGE" }),
    });
    const env = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(env.CF_API_KEY).toBe("cf-key");
    delete process.env.CF_API_KEY;
  });

  // E — port injection
  it("E1: minecraft non-default port → SERVER_PORT injected", async () => {
    await start({
      game_type: "minecraft",
      port: 25566,
      env_vars: JSON.stringify({ EULA: "TRUE" }),
    });
    const env = mockStartGameContainer.mock.calls[0][3] as Record<string, string>;
    expect(env.SERVER_PORT).toBe("25566");
  });

  // D — volume auto-fix
  it("D1: empty volumes + catalog match → remapped + update persisted", async () => {
    mockFindTemplateByImage.mockReturnValue({
      id: "minecraft",
      default_volumes: { "/data/minecraft": "/data" },
    });
    await start({ id: "mc2", volumes: JSON.stringify({}) });
    const vols = mockStartGameContainer.mock.calls[0][4] as Record<string, string>;
    expect(vols).toEqual({ "/data/mc2": "/data" });
    expect(mockServerUpdate).toHaveBeenCalled();
  });

  it("D5: non-empty volumes → unchanged, update not called", async () => {
    await start({ volumes: JSON.stringify({ "/data/minecraft": "/data" }) });
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });

  // F/G — session + watcher
  it("F1: success → sessionStart once + watcher registered", async () => {
    await start({});
    expect(mockSessionStart).toHaveBeenCalledTimes(1);
    expect(mockSessionStart).toHaveBeenCalledWith("minecraft", expect.any(Number));
    expect(mockWatchContainer).toHaveBeenCalledWith("minecraft", expect.any(Function));
  });

  it("F2: replace active → stop(replaced) for prior, markIntentionalStop ordered before", async () => {
    mockGetActiveContainer.mockResolvedValue({ id: "abc", name: "valheim" });
    await start({});
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "replaced", "valheim");
    expect(mockStopJoinableWatcher).toHaveBeenCalledWith("valheim");
    const markOrder = mockMarkIntentionalStop.mock.invocationCallOrder[0];
    const stopOrder = mockSessionStop.mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(stopOrder);
  });

  it("F5/F6: docker throws → code 'docker', no session/watcher", async () => {
    silenceConsole();
    mockStartGameContainer.mockRejectedValue(new Error("boom"));
    const r = await start({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("docker");
    expect(mockSessionStart).not.toHaveBeenCalled();
    expect(mockWatchContainer).not.toHaveBeenCalled();
  });
});

// ─── stopServer ───────────────────────────────────────────────────────────────

describe("stopServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStopGameContainer.mockResolvedValue(undefined);
  });

  it("default reason 'user', correct ordering markIntentionalStop → stopGameContainer", async () => {
    const r = await stopServer("minecraft");
    expect(r.ok).toBe(true);
    expect(mockStopJoinableWatcher).toHaveBeenCalledWith("minecraft");
    expect(mockMarkIntentionalStop).toHaveBeenCalledWith("minecraft");
    expect(mockStopGameContainer).toHaveBeenCalledWith("minecraft");
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "user", "minecraft");
    const markOrder = mockMarkIntentionalStop.mock.invocationCallOrder[0];
    const stopOrder = mockStopGameContainer.mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(stopOrder);
  });

  it("custom reason forwarded to session stop", async () => {
    await stopServer("minecraft", "restart");
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "restart", "minecraft");
  });

  it("docker throws → code 'docker'", async () => {
    mockStopGameContainer.mockRejectedValue(new Error("stop boom"));
    const r = await stopServer("minecraft");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("docker");
  });

  it("backup:true on a running server → backs up before stopping", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    mockCreateBackup.mockResolvedValue({ id: 1 });
    const r = await stopServer("minecraft", "user", { backup: true });
    expect(r.ok).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith("minecraft");
    const backupOrder = mockCreateBackup.mock.invocationCallOrder[0];
    const stopOrder = mockStopGameContainer.mock.invocationCallOrder[0];
    expect(backupOrder).toBeLessThan(stopOrder);
  });

  it("backup:true on a stopped server → skips backup, still stops", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    const r = await stopServer("minecraft", "user", { backup: true });
    expect(r.ok).toBe(true);
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockStopGameContainer).toHaveBeenCalledWith("minecraft");
  });

  it("backup:true but backup fails → backup_failed, does NOT stop", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    mockCreateBackup.mockRejectedValue(new Error("No /data/ volumes configured"));
    const r = await stopServer("minecraft", "user", { backup: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("backup_failed");
    expect(mockStopGameContainer).not.toHaveBeenCalled();
  });
});

// ─── updateServerConfig ─────────────────────────────────────────────────────────

describe("updateServerConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBackup.mockResolvedValue({ id: 1 });
    mockServerGetById.mockReturnValue(
      makeServer({ env_vars: JSON.stringify({ EULA: "TRUE", MOTD: "old" }) }),
    );
  });

  it("not_found when server missing", async () => {
    mockServerGetById.mockReturnValue(undefined);
    const r = await updateServerConfig("ghost", { env_vars: { A: "1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_found");
  });

  it("merge add + overwrite keeps untouched keys", async () => {
    const r = await updateServerConfig(
      "minecraft",
      { env_vars: { MOTD: "new", DIFFICULTY: "hard" } },
      { backup: false },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.env_vars).toEqual({ EULA: "TRUE", MOTD: "new", DIFFICULTY: "hard" });
    }
  });

  it("null value deletes a key", async () => {
    const r = await updateServerConfig(
      "minecraft",
      { env_vars: { MOTD: null } },
      { backup: false },
    );
    if (r.ok) expect(r.data.env_vars).toEqual({ EULA: "TRUE" });
  });

  it("backup runs before update by default", async () => {
    await updateServerConfig("minecraft", { env_vars: { A: "1" } });
    expect(mockCreateBackup).toHaveBeenCalledWith("minecraft");
    const backupOrder = mockCreateBackup.mock.invocationCallOrder[0];
    const updateOrder = mockServerUpdate.mock.invocationCallOrder[0];
    expect(backupOrder).toBeLessThan(updateOrder);
  });

  it("backup failure aborts write", async () => {
    mockCreateBackup.mockRejectedValue(new Error("No /data/ volumes configured"));
    const r = await updateServerConfig("minecraft", { env_vars: { A: "1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("backup_failed");
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });

  it("docker_image patch writes new image", async () => {
    const r = await updateServerConfig(
      "minecraft",
      { docker_image: "itzg/minecraft-server:java17" },
      { backup: false },
    );
    if (r.ok) expect(r.data.docker_image).toBe("itzg/minecraft-server:java17");
  });
});

// ─── restartServer ──────────────────────────────────────────────────────────────

describe("restartServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBackup.mockResolvedValue({ id: 1 });
    mockStartGameContainer.mockResolvedValue(undefined);
    mockStopGameContainer.mockResolvedValue(undefined);
    mockGetActiveContainer.mockResolvedValue(null);
    mockFindTemplateByImage.mockReturnValue(undefined);
    mockServerGetById.mockReturnValue(makeServer());
  });

  it("running → backup + stop('restart') + start", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    const r = await restartServer("minecraft");
    expect(r.ok).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith("minecraft");
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "restart", "minecraft");
    expect(mockStartGameContainer).toHaveBeenCalled();
  });

  it("stopped → start only, no backup, no stop", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    const r = await restartServer("minecraft");
    expect(r.ok).toBe(true);
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockStopGameContainer).not.toHaveBeenCalled();
    expect(mockStartGameContainer).toHaveBeenCalled();
  });

  it("running + backup:false → no backup but still stop+start", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    const r = await restartServer("minecraft", { backup: false });
    expect(r.ok).toBe(true);
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockSessionStop).toHaveBeenCalledWith(expect.any(Number), "restart", "minecraft");
  });

  it("running + backup fails → abort, no stop", async () => {
    mockGetContainerStatus.mockResolvedValue("running");
    mockCreateBackup.mockRejectedValue(new Error("backup boom"));
    const r = await restartServer("minecraft");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("backup_failed");
    expect(mockStopGameContainer).not.toHaveBeenCalled();
  });
});

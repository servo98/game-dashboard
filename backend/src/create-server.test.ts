import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock db ──────────────────────────────────────────────────────────────────
const mockGetById = vi.fn();
const mockGetAll = vi.fn(() => [] as Array<{ id: string; port: number }>);
const mockInsert = vi.fn();

vi.mock("./db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  serverQueries: {
    getAll: { all: (...a: unknown[]) => mockGetAll(...(a as [])) },
    getById: { get: (...a: unknown[]) => mockGetById(...(a as [string])) },
    insert: { run: (...a: unknown[]) => mockInsert(...a) },
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
  botSettingsQueries: { get: { get: vi.fn() }, set: { run: vi.fn() }, unset: { run: vi.fn() } },
  getPanelSetting: vi.fn(() => "6"),
}));

const mockGetRunningGameServers = vi.fn().mockResolvedValue([]);
vi.mock("./docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn().mockResolvedValue([]) },
  gameContainerName: (id: string) => `game-panel-${id}`,
  getRunningGameServers: (...a: unknown[]) => mockGetRunningGameServers(...a),
  getContainerStatus: vi.fn().mockResolvedValue("stopped"),
  startGameContainer: vi.fn(),
  stopGameContainer: vi.fn(),
  markIntentionalStop: vi.fn(),
  watchContainer: vi.fn(),
}));

const mockFindTemplateByImage = vi.fn();
vi.mock("./catalog", () => ({
  GAME_CATALOG: [],
  findTemplate: vi.fn(),
  findTemplateByImage: (...a: unknown[]) => mockFindTemplateByImage(...a),
}));

vi.mock("./backup", () => ({
  createBackup: vi.fn(),
  deleteBackupFile: vi.fn(),
  getBackupFilePath: vi.fn(),
  restoreBackup: vi.fn(),
}));

vi.mock("./joinable-status", () => ({
  beginLogWatching: vi.fn(),
  stopJoinableWatcher: vi.fn(),
  getJoinableStatus: vi.fn(() => null),
}));

const { createServer, runningOnPort, IMAGE_REF_RE } = await import("./server-actions");

const VALID = {
  id: "mi-app",
  name: "Mi App",
  docker_image: "ghcr.io/servo98/mi-app:latest",
  port: 8095,
};

describe("createServer — validación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockReturnValue(undefined);
    mockGetAll.mockReturnValue([]);
  });

  it("da de alta un servidor válido", () => {
    const r = createServer(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.id).toBe("mi-app");
    expect(r.data.game_type).toBe("other");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Mi-App", "mayúsculas"],
    ["mi app", "espacios"],
    ["mi/app", "barras"],
    ["", "vacío"],
  ])("rechaza el id %s (%s)", (id) => {
    const r = createServer({ ...VALID, id });
    expect(r.ok).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each([
    "NOT A VALID IMAGE!!",
    "ghcr.io/owner/img:tag with space",
    "",
  ])("rechaza la imagen %j", (docker_image) => {
    const r = createServer({ ...VALID, docker_image });
    expect(r.ok).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each([
    ["ghcr.io/servo98/mapache-server:latest"],
    ["itzg/minecraft-server:java21"],
    ["localhost:5000/img:tag"],
    ["nginx"],
  ])("acepta la referencia de imagen %s", (image) => {
    expect(IMAGE_REF_RE.test(image)).toBe(true);
  });

  it.each([0, -1, 70000, 1.5])("rechaza el puerto %s", (port) => {
    const r = createServer({ ...VALID, port });
    expect(r.ok).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rechaza un id ya usado", () => {
    mockGetById.mockReturnValue({ id: "mi-app" });
    const r = createServer(VALID);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Ya existe/);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("createServer — volúmenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockReturnValue(undefined);
    mockGetAll.mockReturnValue([]);
  });

  it("monta /data/<id> cuando la imagen no está en el catálogo", () => {
    mockFindTemplateByImage.mockReturnValue(undefined);
    const r = createServer(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.volumes).toEqual({ "/data/mi-app": "/data" });
  });

  it("reapunta los volúmenes del catálogo al id nuevo", () => {
    mockFindTemplateByImage.mockReturnValue({
      id: "minecraft",
      default_volumes: { "/data/minecraft": "/data" },
    });
    const r = createServer({ ...VALID, id: "minecraft-2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.volumes).toEqual({ "/data/minecraft-2": "/data" });
  });

  it("respeta los volúmenes explícitos", () => {
    const r = createServer({ ...VALID, volumes: { "/srv/mio": "/app" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.volumes).toEqual({ "/srv/mio": "/app" });
  });
});

describe("createServer — puertos compartidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockReturnValue(undefined);
  });

  /**
   * El panel tiene a propósito dos Minecraft en el 25565 que nunca corren a la
   * vez, así que compartir puerto se informa pero no bloquea el alta.
   */
  it("informa de quién más usa el puerto sin impedir el alta", () => {
    mockGetAll.mockReturnValue([
      { id: "minecraft", port: 25565 },
      { id: "valheim", port: 2456 },
    ]);
    const r = createServer({ ...VALID, port: 25565 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.port_shared_with).toEqual(["minecraft"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("no informa de nada cuando el puerto está libre", () => {
    mockGetAll.mockReturnValue([{ id: "valheim", port: 2456 }]);
    const r = createServer(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.port_shared_with).toEqual([]);
  });
});

describe("runningOnPort", () => {
  beforeEach(() => vi.clearAllMocks());

  it("solo cuenta los que están realmente en marcha", async () => {
    mockGetAll.mockReturnValue([
      { id: "minecraft", port: 25565 },
      { id: "minecraft-cabin", port: 25565 },
    ]);
    mockGetRunningGameServers.mockResolvedValue([{ id: "minecraft", name: "mc", memoryBytes: 0 }]);
    expect(await runningOnPort(25565)).toEqual(["minecraft"]);
  });

  it("devuelve vacío si ninguno corre", async () => {
    mockGetAll.mockReturnValue([{ id: "minecraft", port: 25565 }]);
    mockGetRunningGameServers.mockResolvedValue([]);
    expect(await runningOnPort(25565)).toEqual([]);
  });
});

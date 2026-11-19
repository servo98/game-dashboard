import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer } from "./__tests__/factories";

/**
 * REGRESIÓN: borrar un servidor solo quitaba su fila y su carpeta de /data. En
 * prod se juntaron contenedores parados de servidores que ya no existían, sus
 * imágenes (retenidas por esos contenedores), respaldos, banners y permisos.
 *
 * Estas pruebas borran sobre carpetas temporales de verdad: lo que importa es
 * qué queda en disco después, no qué funciones se llamaron.
 */

const ROOT = mkdtempSync(join(tmpdir(), "panel-cleanup-"));
const HOST_DATA = join(ROOT, "host-data");
const BACKUPS = join(ROOT, "backups");
const DATA = join(ROOT, "data");
process.env.HOST_DATA_DIR = HOST_DATA;
process.env.BACKUP_DIR = BACKUPS;
process.env.DATA_DIR = DATA;

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

// ─── db ─────────────────────────────────────────────────────────────────────
type Row = ReturnType<typeof makeServer>;
let servers: Row[] = [];
let backupRows: { id: number; server_id: string; filename: string; size_bytes: number }[] = [];
let invites: { id: number; server_ids: string }[] = [];
let orphanRows: { table: string; server_id: string; rows: number }[] = [];

const mockSessionsDelete = vi.fn();
const mockAccessDelete = vi.fn();
const mockDeleteOrphanRows = vi.fn();

vi.mock("./db", () => ({
  serverQueries: {
    getAll: { all: () => servers },
    getById: { get: (id: string) => servers.find((s) => s.id === id) },
    deleteById: {
      run: (id: string) => {
        servers = servers.filter((s) => s.id !== id);
      },
    },
  },
  serverSessionQueries: { deleteByServerId: { run: mockSessionsDelete } },
  userServerAccessQueries: { deleteByServer: { run: mockAccessDelete } },
  backupQueries: {
    list: { all: (id: string) => backupRows.filter((b) => b.server_id === id) },
    deleteByServerId: {
      run: (id: string) => {
        backupRows = backupRows.filter((b) => b.server_id !== id);
      },
    },
  },
  inviteLinkQueries: {
    listAll: { all: () => invites },
    updateServerIds: {
      run: (ids: string, id: number) => {
        invites = invites.map((i) => (i.id === id ? { ...i, server_ids: ids } : i));
      },
    },
  },
  botSettingsQueries: { get: { get: vi.fn() } },
  getPanelSetting: () => "6",
  countOrphanRows: () => orphanRows,
  deleteOrphanRows: () => mockDeleteOrphanRows(),
}));

// ─── docker ─────────────────────────────────────────────────────────────────
const mockGetContainerStatus = vi.fn();
const mockRemoveGameContainer = vi.fn();
const mockRemoveImageIfUnused = vi.fn();
const mockMarkIntentionalStop = vi.fn();
const mockListContainers = vi.fn();
const mockListImages = vi.fn();
const mockPruneImages = vi.fn();
const mockContainerRemove = vi.fn();

vi.mock("./docker", () => ({
  docker: {
    listContainers: (...a: unknown[]) => mockListContainers(...a),
    listImages: (...a: unknown[]) => mockListImages(...a),
    pruneImages: (...a: unknown[]) => mockPruneImages(...a),
    getContainer: (id: string) => ({ remove: (o: unknown) => mockContainerRemove(id, o) }),
  },
  getContainerStatus: (...a: unknown[]) => mockGetContainerStatus(...a),
  removeGameContainer: (...a: unknown[]) => mockRemoveGameContainer(...a),
  removeImageIfUnused: (...a: unknown[]) => mockRemoveImageIfUnused(...a),
  markIntentionalStop: (...a: unknown[]) => mockMarkIntentionalStop(...a),
  getRunningGameServers: vi.fn().mockResolvedValue([]),
  startGameContainer: vi.fn(),
  stopGameContainer: vi.fn(),
  watchContainer: vi.fn(),
}));

const mockStopJoinableWatcher = vi.fn();
vi.mock("./joinable-status", () => ({
  stopJoinableWatcher: (...a: unknown[]) => mockStopJoinableWatcher(...a),
  beginLogWatching: vi.fn(),
}));
vi.mock("./catalog", () => ({ GAME_CATALOG: [], findTemplateByImage: vi.fn() }));
vi.mock("./adapters/minecraft/rcon", () => ({ execRconCommand: vi.fn() }));

const { deleteServer, findOrphans, removeOrphans } = await import("./server-cleanup");

// ─── helpers ────────────────────────────────────────────────────────────────
function seedFile(path: string, content = "x") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function seedServer(overrides: Partial<Row> = {}): Row {
  // Cada servidor con su propia carpeta, como los crea el panel
  const id = overrides.id ?? "minecraft";
  const row = makeServer({ volumes: JSON.stringify({ [`/data/${id}`]: "/data" }), ...overrides });
  servers.push(row);
  for (const hostPath of Object.keys(JSON.parse(row.volumes))) {
    if (hostPath.startsWith("/data/") && hostPath.length > "/data/".length) {
      seedFile(join(HOST_DATA, hostPath.slice("/data/".length), "world.dat"));
    }
  }
  return row;
}

function seedBackup(serverId: string, filename: string) {
  seedFile(join(BACKUPS, serverId, filename), "backup");
  backupRows.push({ id: backupRows.length + 1, server_id: serverId, filename, size_bytes: 6 });
}

const SHA = (n: string) => `sha256:${n.repeat(64).slice(0, 64)}`;

beforeEach(() => {
  vi.clearAllMocks();
  servers = [];
  backupRows = [];
  invites = [];
  orphanRows = [];
  for (const dir of [HOST_DATA, BACKUPS, DATA]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  mockGetContainerStatus.mockResolvedValue("stopped");
  mockRemoveGameContainer.mockResolvedValue({ removed: true, imageId: SHA("a") });
  mockRemoveImageIfUnused.mockResolvedValue("removed");
  mockListContainers.mockResolvedValue([]);
  mockListImages.mockResolvedValue([]);
  mockPruneImages.mockResolvedValue({ ImagesDeleted: [], SpaceReclaimed: 0 });
  mockContainerRemove.mockResolvedValue(undefined);
});

// ─── deleteServer ───────────────────────────────────────────────────────────
describe("deleteServer", () => {
  it("no deja nada: contenedor, imagen, datos, respaldos, banner y filas", async () => {
    seedServer({ id: "pz", docker_image: "gameservermanagers/gameserver:pz" });
    seedBackup("pz", "pz_1.tar.zst");
    seedBackup("pz", "pz_2.tar.zst");
    seedFile(join(DATA, "banners", "pz.jpg"));
    invites = [{ id: 7, server_ids: JSON.stringify(["pz", "minecraft"]) }];

    const result = await deleteServer("pz");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      container: true,
      image: "removed",
      data_removed: ["/data/pz"],
      data_kept: [],
      backups: { files: 2, bytes: 12 },
      warnings: [],
    });

    // En disco no queda nada suyo
    expect(existsSync(join(HOST_DATA, "pz"))).toBe(false);
    expect(existsSync(join(BACKUPS, "pz"))).toBe(false);
    expect(existsSync(join(DATA, "banners", "pz.jpg"))).toBe(false);

    // Ni en Docker
    expect(mockRemoveGameContainer).toHaveBeenCalledWith("pz");
    expect(mockRemoveImageIfUnused).toHaveBeenCalledWith(SHA("a"), []);

    // Ni en la base
    expect(servers).toEqual([]);
    expect(backupRows).toEqual([]);
    expect(mockSessionsDelete).toHaveBeenCalledWith("pz");
    expect(mockAccessDelete).toHaveBeenCalledWith("pz");
    expect(JSON.parse(invites[0].server_ids)).toEqual(["minecraft"]);
  });

  it("no toca nada de los demás servidores", async () => {
    seedServer({ id: "pz", volumes: JSON.stringify({ "/data/pz": "/data" }) });
    seedServer({ id: "minecraft" });
    seedBackup("pz", "pz_1.tar.zst");
    seedBackup("minecraft", "mc_1.tar.zst");
    seedFile(join(DATA, "banners", "minecraft.jpg"));

    await deleteServer("pz");

    expect(existsSync(join(HOST_DATA, "minecraft", "world.dat"))).toBe(true);
    expect(existsSync(join(BACKUPS, "minecraft", "mc_1.tar.zst"))).toBe(true);
    expect(existsSync(join(DATA, "banners", "minecraft.jpg"))).toBe(true);
    expect(servers.map((s) => s.id)).toEqual(["minecraft"]);
    expect(backupRows.map((b) => b.server_id)).toEqual(["minecraft"]);
  });

  it("pasa las imágenes de los demás servidores para que no se borren", async () => {
    seedServer({ id: "minecraft-cabin", docker_image: "itzg/minecraft-server:java21" });
    seedServer({ id: "minecraft", docker_image: "itzg/minecraft-server", env_vars: "{}" });
    seedServer({ id: "valheim", docker_image: "lloesche/valheim-server" });

    await deleteServer("minecraft-cabin");

    // "minecraft" no tiene tag en la base, pero arranca con java21: tiene que contar.
    expect(mockRemoveImageIfUnused).toHaveBeenCalledWith(SHA("a"), [
      "itzg/minecraft-server:java21",
      "lloesche/valheim-server",
    ]);
  });

  it("reporta la imagen como en uso cuando otro la necesita", async () => {
    seedServer({ id: "pz" });
    mockRemoveImageIfUnused.mockResolvedValue("in-use");

    const result = await deleteServer("pz");

    expect(result.ok && result.data.image).toBe("in-use");
  });

  it("servidor que nunca arrancó: se borra igual, sin contenedor", async () => {
    seedServer({ id: "nuevo" });
    mockGetContainerStatus.mockResolvedValue("missing");
    mockRemoveGameContainer.mockResolvedValue({ removed: false, imageId: null });
    mockRemoveImageIfUnused.mockResolvedValue("missing");

    const result = await deleteServer("nuevo");

    expect(result.ok && result.data).toMatchObject({ container: false, image: null });
    expect(servers).toEqual([]);
  });

  it("se niega si el servidor está corriendo, y no toca nada", async () => {
    seedServer({ id: "pz" });
    seedBackup("pz", "pz_1.tar.zst");
    mockGetContainerStatus.mockResolvedValue("running");

    const result = await deleteServer("pz");

    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(mockRemoveGameContainer).not.toHaveBeenCalled();
    expect(existsSync(join(HOST_DATA, "pz", "world.dat"))).toBe(true);
    expect(existsSync(join(BACKUPS, "pz", "pz_1.tar.zst"))).toBe(true);
    expect(servers).toHaveLength(1);
  });

  it("si Docker no deja quitar el contenedor, aborta sin borrar nada más", async () => {
    seedServer({ id: "pz" });
    seedBackup("pz", "pz_1.tar.zst");
    mockRemoveGameContainer.mockRejectedValue(new Error("daemon busy"));

    const result = await deleteServer("pz");

    // Mejor un servidor entero que se puede reintentar que una fila borrada
    // con su contenedor todavía en el host.
    expect(result).toMatchObject({ ok: false, code: "docker" });
    expect(servers).toHaveLength(1);
    expect(existsSync(join(HOST_DATA, "pz", "world.dat"))).toBe(true);
    expect(existsSync(join(BACKUPS, "pz", "pz_1.tar.zst"))).toBe(true);
    expect(mockSessionsDelete).not.toHaveBeenCalled();
  });

  it("devuelve not_found si no existe", async () => {
    expect(await deleteServer("nope")).toMatchObject({ ok: false, code: "not_found" });
  });

  it("no borra una carpeta que comparte con otro servidor", async () => {
    seedServer({ id: "a", volumes: JSON.stringify({ "/data/shared": "/data" }) });
    seedServer({ id: "b", volumes: JSON.stringify({ "/data/shared/sub": "/data" }) });

    const result = await deleteServer("a");

    expect(result.ok && result.data.data_kept).toEqual([
      { path: "/data/shared", reason: "la usa otro servidor" },
    ]);
    expect(existsSync(join(HOST_DATA, "shared", "sub", "world.dat"))).toBe(true);
  });

  it.each([
    ["/data/"],
    ["/data/.."],
    ["/data/../etc"],
    ["/data/x/../.."],
    ["/srv/otra-cosa"],
  ])("nunca borra fuera de la carpeta del servidor (%s)", async (hostPath) => {
    seedFile(join(HOST_DATA, "vecino", "world.dat"));
    seedFile(join(ROOT, "fuera.txt"));
    servers.push(makeServer({ id: "raro", volumes: JSON.stringify({ [hostPath]: "/data" }) }));

    const result = await deleteServer("raro");

    expect(result.ok && result.data.data_removed).toEqual([]);
    expect(result.ok && result.data.data_kept).toEqual([
      { path: hostPath, reason: "fuera de /data" },
    ]);
    expect(existsSync(join(HOST_DATA, "vecino", "world.dat"))).toBe(true);
    expect(existsSync(join(ROOT, "fuera.txt"))).toBe(true);
  });

  it("quita la carpeta padre cuando se queda vacía (los dos volúmenes de Valheim)", async () => {
    seedServer({
      id: "valheim",
      volumes: JSON.stringify({
        "/data/valheim/config": "/config",
        "/data/valheim/data": "/opt/valheim",
      }),
    });
    seedFile(join(HOST_DATA, "otro", "world.dat"));

    await deleteServer("valheim");

    expect(existsSync(join(HOST_DATA, "valheim"))).toBe(false);
    // ...pero no sigue subiendo: /host-data y lo de al lado siguen ahí
    expect(readdirSync(HOST_DATA)).toEqual(["otro"]);
  });

  it("deja la carpeta padre si todavía tiene otras cosas", async () => {
    seedServer({ id: "v", volumes: JSON.stringify({ "/data/juegos/v": "/data" }) });
    seedFile(join(HOST_DATA, "juegos", "notas.txt"));

    await deleteServer("v");

    expect(readdirSync(join(HOST_DATA, "juegos"))).toEqual(["notas.txt"]);
  });
});

// ─── restos ─────────────────────────────────────────────────────────────────
function container(name: string, state: "running" | "exited", extra: object = {}) {
  return {
    Id: `id-${name}`,
    ImageID: SHA("b"),
    Names: [`/${name}`],
    Image: "gameservermanagers/gameserver:pz",
    Status: state === "running" ? "Up 2 hours" : "Exited (0) 6 weeks ago",
    State: state,
    Labels: {},
    ...extra,
  };
}

describe("findOrphans", () => {
  it("lista solo lo que no pertenece a ningún servidor del panel", async () => {
    seedServer({ id: "minecraft" });
    seedBackup("minecraft", "mc_1.tar.zst");
    seedFile(join(BACKUPS, "minecraft-magico", "viejo.tar.zst"), "12345");
    seedFile(join(DATA, "banners", "minecraft.jpg"));
    seedFile(join(DATA, "banners", "terrariaserver.png"));
    orphanRows = [{ table: "user_server_access", server_id: "minecraft-magico", rows: 1 }];
    mockListContainers.mockResolvedValue([
      container("game-panel-minecraft", "exited"),
      container("game-panel-pzserver", "exited"),
      container("game-panel-backend-1", "running", {
        Labels: { "com.docker.compose.service": "backend" },
      }),
      container("otra-cosa", "exited"),
    ]);
    mockListImages.mockResolvedValue([{ Size: 900 }, { Size: 100 }]);

    expect(await findOrphans()).toEqual({
      containers: [
        {
          name: "game-panel-pzserver",
          image: "gameservermanagers/gameserver:pz",
          status: "Exited (0) 6 weeks ago",
          running: false,
        },
      ],
      backup_dirs: [{ server_id: "minecraft-magico", files: 1, bytes: 5 }],
      banners: ["terrariaserver.png"],
      db_rows: [{ table: "user_server_access", server_id: "minecraft-magico", rows: 1 }],
      dangling_images: 2,
    });
  });
});

describe("removeOrphans", () => {
  it("borra los restos y deja intacto lo de los servidores que existen", async () => {
    seedServer({ id: "minecraft", docker_image: "itzg/minecraft-server:java21" });
    seedBackup("minecraft", "mc_1.tar.zst");
    seedFile(join(BACKUPS, "minecraft-magico", "viejo.tar.zst"), "12345");
    seedFile(join(DATA, "banners", "minecraft.jpg"));
    seedFile(join(DATA, "banners", "terrariaserver.png"));
    orphanRows = [{ table: "user_server_access", server_id: "minecraft-magico", rows: 1 }];
    mockListContainers.mockResolvedValue([
      container("game-panel-minecraft", "exited"),
      container("game-panel-pzserver", "exited"),
      container("game-panel-nginx-1", "running", {
        Labels: { "com.docker.compose.service": "nginx" },
      }),
    ]);
    mockPruneImages.mockResolvedValue({
      ImagesDeleted: [{ Deleted: "sha256:1" }, { Untagged: "x" }],
      SpaceReclaimed: 500,
    });

    const report = await removeOrphans();

    expect(report).toEqual({
      containers_removed: ["game-panel-pzserver"],
      containers_skipped: [],
      images_removed: 2, // la del contenedor + una sin etiqueta
      backup_dirs_removed: ["minecraft-magico"],
      banners_removed: ["terrariaserver.png"],
      db_rows_removed: 1,
      bytes_reclaimed: 500 + 5,
      warnings: [],
    });

    // Solo se quitó el contenedor huérfano, y sin forzar
    expect(mockContainerRemove).toHaveBeenCalledTimes(1);
    expect(mockContainerRemove).toHaveBeenCalledWith("id-game-panel-pzserver", { v: true });
    // Su imagen se borra respetando las de los servidores vivos
    expect(mockRemoveImageIfUnused).toHaveBeenCalledWith(SHA("b"), [
      "itzg/minecraft-server:java21",
    ]);
    expect(mockDeleteOrphanRows).toHaveBeenCalled();

    expect(existsSync(join(BACKUPS, "minecraft-magico"))).toBe(false);
    expect(existsSync(join(DATA, "banners", "terrariaserver.png"))).toBe(false);
    // Lo del servidor que sí existe sigue ahí
    expect(existsSync(join(BACKUPS, "minecraft", "mc_1.tar.zst"))).toBe(true);
    expect(existsSync(join(DATA, "banners", "minecraft.jpg"))).toBe(true);
    expect(existsSync(join(HOST_DATA, "minecraft", "world.dat"))).toBe(true);
  });

  it("no toca un contenedor sin servidor que siga corriendo", async () => {
    seedServer({ id: "minecraft" });
    mockListContainers.mockResolvedValue([container("game-panel-fantasma", "running")]);

    const report = await removeOrphans();

    expect(report.containers_skipped).toEqual(["game-panel-fantasma"]);
    expect(report.containers_removed).toEqual([]);
    expect(mockContainerRemove).not.toHaveBeenCalled();
  });

  it("se niega si el panel no tiene servidores: todo parecería un resto", async () => {
    seedFile(join(BACKUPS, "minecraft", "mc_1.tar.zst"));
    mockListContainers.mockResolvedValue([container("game-panel-minecraft", "exited")]);

    await expect(removeOrphans()).rejects.toThrow(/no tiene servidores/);

    expect(mockContainerRemove).not.toHaveBeenCalled();
    expect(mockPruneImages).not.toHaveBeenCalled();
    expect(existsSync(join(BACKUPS, "minecraft", "mc_1.tar.zst"))).toBe(true);
  });
});

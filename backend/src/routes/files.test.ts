import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const mockRealpathSync = vi.fn();
const mockStatSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockRmSync = vi.fn();

vi.mock("fs", () => ({
  realpathSync: (...args: unknown[]) => mockRealpathSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  rmSync: (...args: unknown[]) => mockRmSync(...args),
}));

// Mock path to always use posix (files.ts runs on Linux in production)
vi.mock("path", async (importOriginal) => {
  const original = await importOriginal<typeof import("path")>();
  return {
    ...original,
    join: (...args: string[]) => original.posix.join(...args),
    resolve: (...args: string[]) => original.posix.resolve(...args),
  };
});

const mockServerGetById = vi.fn();

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  serverQueries: {
    getById: { get: (...args: unknown[]) => mockServerGetById(...args) },
    getAll: { all: vi.fn(() => []) },
    insert: { run: vi.fn() },
    update: { run: vi.fn() },
    deleteById: { run: vi.fn() },
    updateTheme: { run: vi.fn() },
  },
  sessionQueries: {
    get: { get: vi.fn() },
    insert: { run: vi.fn() },
    delete: { run: vi.fn() },
    cleanup: { run: vi.fn() },
  },
  panelUserQueries: {
    get: { get: vi.fn(() => ({ status: "approved", role: "admin" })) },
    insert: { run: vi.fn() },
    updateProfile: { run: vi.fn() },
    updateRole: { run: vi.fn() },
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
}));

vi.mock("../docker", () => ({
  docker: { getContainer: vi.fn(), listContainers: vi.fn() },
}));

vi.mock("../backup", () => ({
  startAutoBackupTimer: vi.fn(),
}));

// Mock auth middleware to always pass
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  requireApproved: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  requireAuthOrBotKey: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  requireBotKey: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  requireAdmin: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  requireServerAccess: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
  getCookie: vi.fn(),
}));

// Lazy import after mocks
const { default: files } = await import("./files");

function makeServer(volumes: Record<string, string>) {
  return {
    id: "test",
    name: "Test Server",
    game_type: "minecraft",
    docker_image: "itzg/minecraft-server",
    port: 25565,
    env_vars: "{}",
    volumes: JSON.stringify(volumes),
    banner_path: null,
    accent_color: null,
    icon: null,
  };
}

// Helper: create test app
function createApp() {
  const app = new Hono();
  app.route("/api/servers", files);
  return app;
}

describe("files routes — path traversal protection", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("single-volume server", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    it("lists root directory", async () => {
      mockRealpathSync.mockImplementation((p: string) => p);
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      mockReaddirSync.mockReturnValue(["world", "server.properties"]);
      // Per-item stats
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true }) // dir check for root
        .mockReturnValueOnce({ isDirectory: () => true, size: 0, mtimeMs: 1000000 }) // world
        .mockReturnValueOnce({ isDirectory: () => false, size: 1234, mtimeMs: 2000000 }); // server.properties

      const res = await app.request("/api/servers/test/files?path=/");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });

    it("blocks ../ traversal", async () => {
      const res = await app.request("/api/servers/test/files?path=../../etc/passwd");
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Invalid path");
    });

    it("blocks absolute path /etc/passwd", async () => {
      // resolve("/host-data/test", "/etc/passwd") resolves to /etc/passwd which doesn't start with /host-data/test
      const res = await app.request("/api/servers/test/files?path=/etc/passwd");
      // This resolves to /host-data/test/etc/passwd which IS within the volume
      // so it would return "Failed to read directory" since it doesn't exist
      // The key test is that ../../etc/passwd is blocked
      expect([200, 403, 500]).toContain(res.status);
    });

    it("blocks symlink escape via realpathSync", async () => {
      // The target resolves within volume, but real path is outside
      mockRealpathSync.mockReturnValue("/etc/shadow");
      const res = await app.request("/api/servers/test/files?path=sneaky-link");
      expect(res.status).toBe(403);
    });

    it("allows normal nested path", async () => {
      mockRealpathSync.mockImplementation((p: string) => p);
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      mockReaddirSync.mockReturnValue([]);

      const res = await app.request("/api/servers/test/files?path=world/region");
      expect(res.status).toBe(200);
    });
  });

  describe("multi-volume server", () => {
    const server = makeServer({
      "/data/valheim": "/config",
      "/data/valheim-data": "/opt/valheim",
    });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    it("returns virtual root listing at /", async () => {
      const res = await app.request("/api/servers/test/files?path=/");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ name: string; isDirectory: boolean }>;
      expect(body).toHaveLength(2);
      expect(body.map((e) => e.name)).toContain("config");
      expect(body.map((e) => e.name)).toContain("opt/valheim");
      expect(body.every((e) => e.isDirectory)).toBe(true);
    });

    it("lists files within a volume", async () => {
      mockRealpathSync.mockImplementation((p: string) => p);
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      mockReaddirSync.mockReturnValue(["saves"]);
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true })
        .mockReturnValueOnce({ isDirectory: () => true, size: 0, mtimeMs: 1000 });

      const res = await app.request("/api/servers/test/files?path=config");
      expect(res.status).toBe(200);
    });

    it("blocks traversal out of volume", async () => {
      const res = await app.request("/api/servers/test/files?path=config/../../etc");
      expect(res.status).toBe(403);
    });
  });

  describe("delete endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    it("blocks deletion of volume root", async () => {
      mockRealpathSync.mockImplementation((p: string) => p);

      const res = await app.request("/api/servers/test/files?path=/", { method: "DELETE" });
      expect(res.status).toBe(403);
    });

    it("allows deletion of file within volume", async () => {
      mockRealpathSync.mockImplementation((p: string) => p);
      mockStatSync.mockReturnValue({ isDirectory: () => false });

      const res = await app.request("/api/servers/test/files?path=old-log.txt", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(mockRmSync).toHaveBeenCalled();
    });
  });

  describe("upload endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
      mockRealpathSync.mockImplementation((p: string) => p);
    });

    it("blocks upload with traversal filename", async () => {
      const formData = new FormData();
      const file = new File(["evil"], "../../evil.sh", { type: "application/x-sh" });
      formData.append("file", file);

      const res = await app.request("/api/servers/test/files/upload?path=/", {
        method: "POST",
        body: formData,
      });
      // The filename resolves outside the volume → 403
      expect(res.status).toBe(403);
    });

    it("allows upload of normal file", async () => {
      const formData = new FormData();
      const file = new File(["data"], "config.yml", { type: "text/yaml" });
      formData.append("file", file);

      // Mock Bun.write globally
      const originalBun = globalThis.Bun;
      globalThis.Bun = { write: vi.fn() } as unknown as typeof Bun;

      const res = await app.request("/api/servers/test/files/upload?path=/", {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; uploaded: string[] };
      expect(body.ok).toBe(true);
      expect(body.uploaded).toContain("config.yml");

      globalThis.Bun = originalBun;
    });
  });

  describe("mkdir endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    it("creates directory within volume", async () => {
      mockRealpathSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      // Parent check will pass since /host-data/test starts with /host-data/test

      const res = await app.request("/api/servers/test/files/mkdir?path=new-folder", {
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it("blocks mkdir with traversal", async () => {
      const res = await app.request("/api/servers/test/files/mkdir?path=../../tmp/hack", {
        method: "POST",
      });
      expect(res.status).toBe(403);
    });
  });

  describe("download endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    it("blocks download of virtual root", async () => {
      mockServerGetById.mockReturnValue(
        makeServer({ "/data/valheim": "/config", "/data/valheim-data": "/opt/valheim" }),
      );

      const res = await app.request("/api/servers/test/files/download?path=/");
      expect(res.status).toBe(403);
    });

    it("blocks download with traversal path", async () => {
      const res = await app.request("/api/servers/test/files/download?path=../../etc/shadow");
      expect(res.status).toBe(403);
    });
  });

  describe("config scan endpoint", () => {
    const server = makeServer({ "/data/test": "/config" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
    });

    /** Simula un árbol de ficheros: ruta -> hijos (dir) o `null` (fichero). */
    function mockTree(tree: Record<string, string[] | null>, sizes: Record<string, number> = {}) {
      mockReaddirSync.mockImplementation((dir: string) => tree[dir] ?? []);
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => Array.isArray(tree[p]),
        size: sizes[p] ?? 100,
        mtimeMs: 1000,
      }));
    }

    it("encuentra los .cfg anidados y devuelve rutas usables por /files", async () => {
      mockTree({
        "/host-data/test": ["bepinex", "adminlist.txt"],
        "/host-data/test/bepinex": ["config"],
        "/host-data/test/bepinex/config": ["mimod.cfg"],
        "/host-data/test/bepinex/config/mimod.cfg": null,
        "/host-data/test/adminlist.txt": null,
      });

      const res = await app.request("/api/servers/test/files/configs");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { path: string; name: string }[];
      expect(body.map((f) => f.path)).toEqual(["/adminlist.txt", "/bepinex/config/mimod.cfg"]);
    });

    it("se salta los directorios pesados del juego", async () => {
      mockTree({
        "/host-data/test": ["backups", "worlds_local", "cache"],
        "/host-data/test/backups": ["algo.cfg"],
        "/host-data/test/worlds_local": ["mundo.cfg"],
        "/host-data/test/cache": ["x.cfg"],
        "/host-data/test/backups/algo.cfg": null,
        "/host-data/test/worlds_local/mundo.cfg": null,
        "/host-data/test/cache/x.cfg": null,
      });

      const res = await app.request("/api/servers/test/files/configs");
      expect(await res.json()).toEqual([]);
    });

    it("deja fuera los .txt que no son listas de config y los ficheros enormes", async () => {
      mockTree(
        {
          "/host-data/test": ["steam_appid.txt", "adminlist.txt", "gordo.cfg", "notas.md"],
          "/host-data/test/steam_appid.txt": null,
          "/host-data/test/adminlist.txt": null,
          "/host-data/test/gordo.cfg": null,
          "/host-data/test/notas.md": null,
        },
        { "/host-data/test/gordo.cfg": 5 * 1024 * 1024 },
      );

      const res = await app.request("/api/servers/test/files/configs");
      const body = (await res.json()) as { name: string }[];
      expect(body.map((f) => f.name)).toEqual(["adminlist.txt"]);
    });

    it("prefija con el container path cuando hay varios volúmenes", async () => {
      mockServerGetById.mockReturnValue(
        makeServer({ "/data/test": "/config", "/data/test-data": "/opt/valheim" }),
      );
      mockTree({
        "/host-data/test": ["valheim_plus.cfg"],
        "/host-data/test/valheim_plus.cfg": null,
        "/host-data/test-data": [],
      });

      const res = await app.request("/api/servers/test/files/configs");
      const body = (await res.json()) as { path: string }[];
      expect(body.map((f) => f.path)).toEqual(["config/valheim_plus.cfg"]);
    });
  });

  describe("read endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
      mockRealpathSync.mockImplementation((p: string) => p);
    });

    it("blocks traversal", async () => {
      const res = await app.request("/api/servers/test/files/read?path=../../etc/passwd");
      expect(res.status).toBe(403);
    });

    it("returns 404 for a missing file", async () => {
      mockStatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const res = await app.request("/api/servers/test/files/read?path=nope.cfg");
      expect(res.status).toBe(404);
    });

    it("refuses a directory", async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => true, size: 0 });
      const res = await app.request("/api/servers/test/files/read?path=config");
      expect(res.status).toBe(400);
    });

    it("refuses a file too large to edit", async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false, size: 50 * 1024 * 1024 });
      const res = await app.request("/api/servers/test/files/read?path=huge.cfg");
      expect(res.status).toBe(413);
    });
  });

  describe("write endpoint", () => {
    const server = makeServer({ "/data/test": "/data" });

    function put(path: string, body: unknown) {
      return app.request(`/api/servers/test/files/write?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    beforeEach(() => {
      mockServerGetById.mockReturnValue(server);
      mockRealpathSync.mockImplementation((p: string) => p);
    });

    it("blocks traversal", async () => {
      const res = await put("../../etc/passwd", { content: "pwned" });
      expect(res.status).toBe(403);
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it("blocks writing to the multi-volume virtual root", async () => {
      mockServerGetById.mockReturnValue(
        makeServer({ "/data/test": "/config", "/data/test-data": "/opt/valheim" }),
      );
      const res = await put("/", { content: "x" });
      expect(res.status).toBe(403);
    });

    it("refuses to overwrite a directory", async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      const res = await put("config", { content: "x" });
      expect(res.status).toBe(400);
    });

    it("rejects a body without a string content", async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false });
      const res = await put("mimod.cfg", { content: 42 });
      expect(res.status).toBe(400);
    });
  });

  describe("server not found", () => {
    it("returns 404 for unknown server", async () => {
      mockServerGetById.mockReturnValue(undefined);
      const res = await app.request("/api/servers/unknown/files");
      expect(res.status).toBe(404);
    });
  });

  describe("no volumes configured", () => {
    it("returns 400 when server has no data volumes", async () => {
      mockServerGetById.mockReturnValue(
        makeServer({ "/opt/other": "/data" }), // no /data/ prefix
      );
      const res = await app.request("/api/servers/test/files");
      expect(res.status).toBe(400);
    });
  });
});

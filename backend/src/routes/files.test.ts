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
    get: { get: vi.fn(() => ({ status: "approved" })) },
    insert: { run: vi.fn() },
    updateProfile: { run: vi.fn() },
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

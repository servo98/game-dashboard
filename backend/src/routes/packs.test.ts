import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRealpathSync = vi.fn();
const mockStatSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("fs", () => ({
  realpathSync: (...args: unknown[]) => mockRealpathSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

vi.mock("path", async (importOriginal) => {
  const original = await importOriginal<typeof import("path")>();
  return { ...original, join: (...args: string[]) => original.posix.join(...args) };
});

const mockServerGetById = vi.fn();
vi.mock("../db", () => ({
  serverQueries: { getById: { get: (...args: unknown[]) => mockServerGetById(...args) } },
}));

const { default: packs } = await import("./packs");

function app() {
  const a = new Hono();
  a.route("/api/packs", packs);
  return a;
}

function server(over: Record<string, unknown> = {}) {
  return {
    id: "minecraft",
    // Como en prod: el server "minecraft" está dado de alta como "sandbox".
    game_type: "sandbox",
    docker_image: "itzg/minecraft-server:java21",
    volumes: JSON.stringify({ "/data/minecraft": "/data" }),
    ...over,
  };
}

const DIR = "/host-data/minecraft/resourcepacks";

describe("GET /api/packs/:serverId/:file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerGetById.mockReturnValue(server());
    mockRealpathSync.mockImplementation((p: string) => p);
    mockStatSync.mockReturnValue({ isFile: () => true, size: 3 });
    mockReadFileSync.mockReturnValue(Buffer.from("PK!"));
  });

  it("entrega el zip de resourcepacks/ del servidor, sin sesión", async () => {
    const res = await app().request("/api/packs/minecraft/pack-f1.zip");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(await res.text()).toBe("PK!");
    expect(mockReadFileSync).toHaveBeenCalledWith(`${DIR}/pack-f1.zip`);
  });

  it("cada servidor usa su propia carpeta", async () => {
    mockServerGetById.mockReturnValue(
      server({
        id: "minecraft-cabin",
        volumes: JSON.stringify({ "/data/minecraft-cabin": "/data" }),
      }),
    );
    const res = await app().request("/api/packs/minecraft-cabin/otro.zip");
    expect(res.status).toBe(200);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      "/host-data/minecraft-cabin/resourcepacks/otro.zip",
    );
  });

  it.each([
    ["no .zip", "/api/packs/minecraft/server.properties"],
    ["traversal", "/api/packs/minecraft/..%2Fserver.properties"],
    ["oculto", "/api/packs/minecraft/.secreto.zip"],
    ["id raro", "/api/packs/MINE..craft/pack.zip"],
  ])("404 con nombre inválido (%s)", async (_label, url) => {
    const res = await app().request(url);
    expect(res.status).toBe(404);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("404 si el servidor no existe o no es de Minecraft", async () => {
    mockServerGetById.mockReturnValueOnce(undefined);
    expect((await app().request("/api/packs/nope/pack.zip")).status).toBe(404);
    mockServerGetById.mockReturnValueOnce(
      server({ game_type: "valheim", docker_image: "lloesche/valheim-server" }),
    );
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("404 si el volumen /data no está bajo /data/ del host", async () => {
    mockServerGetById.mockReturnValue(server({ volumes: JSON.stringify({ "/srv/mc": "/data" }) }));
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
  });

  it("404 si un symlink apunta fuera de resourcepacks/", async () => {
    mockRealpathSync.mockImplementation((p: string) =>
      p.endsWith("pack.zip") ? "/host-data/minecraft/world/level.dat" : p,
    );
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("404 si no existe, no es archivo o pasa de 250 MB", async () => {
    mockRealpathSync
      .mockImplementationOnce((p: string) => p)
      .mockImplementationOnce(() => {
        throw new Error("ENOENT");
      });
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
    mockStatSync.mockReturnValueOnce({ isFile: () => false, size: 1 });
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
    mockStatSync.mockReturnValueOnce({ isFile: () => true, size: 251 * 1024 * 1024 });
    expect((await app().request("/api/packs/minecraft/pack.zip")).status).toBe(404);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });
});

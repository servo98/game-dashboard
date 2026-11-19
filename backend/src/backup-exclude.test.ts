import { execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESIÓN: el respaldo empaquetaba el volumen entero. Un servidor con un
 * disco de juego de 4.45 GB que nunca cambia generó 17 GB de copias en un día
 * (una por cada actualización) para proteger unos KB de cuentas.
 */

const ROOT = mkdtempSync(join(tmpdir(), "panel-backup-"));
const HOST_DATA = join(ROOT, "host-data");
const BACKUPS = join(ROOT, "backups");
process.env.HOST_DATA_DIR = HOST_DATA;
process.env.BACKUP_DIR = BACKUPS;

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

let backupRows: { id: number; server_id: string; filename: string; size_bytes: number }[] = [];

vi.mock("./db", () => ({
  backupQueries: {
    list: { all: (id: string) => backupRows.filter((b) => b.server_id === id) },
    deleteByServerId: {
      run: (id: string) => {
        backupRows = backupRows.filter((b) => b.server_id !== id);
      },
    },
  },
  serverQueries: { getById: { get: vi.fn() } },
  getPanelSetting: () => "5",
}));
vi.mock("./docker", () => ({ getContainerStatus: vi.fn(), getRunningGameServers: vi.fn() }));
vi.mock("./adapters/minecraft/rcon", () => ({ execRconCommand: vi.fn() }));

const { backupTarArgs, deleteServerBackups, parseBackupExclude } = await import("./backup");

const VOLUMES = { "/data/svr2007": "/data" };

function file(path: string, content = "x") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  backupRows = [];
  for (const dir of [HOST_DATA, BACKUPS]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
});

describe("parseBackupExclude", () => {
  it("acepta rutas dentro de un volumen del servidor y las normaliza", () => {
    expect(
      parseBackupExclude(
        ["/data/svr2007/disc/", "  /data/svr2007/web/./cache  ", "", "/data/svr2007/disc"],
        VOLUMES,
      ),
    ).toEqual({ ok: true, paths: ["/data/svr2007/disc", "/data/svr2007/web/cache"] });
  });

  it("una lista vacía es válida: respalda todo", () => {
    expect(parseBackupExclude([], VOLUMES)).toEqual({ ok: true, paths: [] });
  });

  it.each([
    ["el volumen entero", "/data/svr2007"],
    ["otro servidor", "/data/minecraft/world"],
    ["un prefijo parecido", "/data/svr2007-otro/x"],
    ["una ruta que se escapa", "/data/svr2007/../minecraft"],
    ["fuera de /data", "/etc/passwd"],
    ["relativa", "disc"],
  ])("rechaza %s (%s)", (_label, path) => {
    expect(parseBackupExclude([path], VOLUMES).ok).toBe(false);
  });

  it("rechaza lo que no sea una lista de textos", () => {
    expect(parseBackupExclude("/data/svr2007/disc", VOLUMES).ok).toBe(false);
    expect(parseBackupExclude([42], VOLUMES).ok).toBe(false);
  });
});

describe("backupTarArgs", () => {
  const server = (exclude: string[]) => ({
    volumes: JSON.stringify(VOLUMES),
    backup_exclude: JSON.stringify(exclude),
  });

  it("sin exclusiones el comando es el de siempre", () => {
    expect(backupTarArgs(server([]), "/out.tar.zst", ["svr2007"])).toEqual([
      "tar",
      "--zstd",
      "-cf",
      "/out.tar.zst",
      "-C",
      HOST_DATA,
      "svr2007",
    ]);
  });

  it("ignora exclusiones guardadas que ya no caen en ningún volumen", () => {
    const stale = {
      volumes: JSON.stringify({ "/data/otro": "/data" }),
      backup_exclude: '["/data/svr2007/disc"]',
    };
    expect(backupTarArgs(stale, "/out.tar.zst", ["otro"])).not.toContain("--anchored");
    expect(backupTarArgs({ ...stale, backup_exclude: "no es json" }, "/o", ["otro"])).toHaveLength(
      7,
    );
  });

  it("tar de verdad: se salta lo excluido y solo eso", () => {
    file(join(HOST_DATA, "svr2007", "disc", "game.iso"), "x".repeat(4096));
    file(join(HOST_DATA, "svr2007", "dwdata", "accounts.db"), "cuentas");
    // Un "disc" más adentro NO debe saltarse: la exclusión va anclada a la raíz
    file(join(HOST_DATA, "svr2007", "dwdata", "disc", "nota.txt"), "se queda");
    file(join(HOST_DATA, "svr2007", "cache-1.tmp"));
    file(join(HOST_DATA, "svr2007", "keep.cfg"));

    const out = join(BACKUPS, "t.tar.zst");
    const [bin, ...args] = backupTarArgs(
      server(["/data/svr2007/disc", "/data/svr2007/cache-*.tmp"]),
      out,
      ["svr2007"],
    );
    execFileSync(bin, args);

    const listed = execFileSync("tar", ["--zstd", "-tf", out]).toString().trim().split("\n").sort();
    expect(listed).toEqual([
      "svr2007/",
      "svr2007/dwdata/",
      "svr2007/dwdata/accounts.db",
      "svr2007/dwdata/disc/",
      "svr2007/dwdata/disc/nota.txt",
      "svr2007/keep.cfg",
    ]);
  });
});

describe("deleteServerBackups", () => {
  it("borra archivos, carpeta y filas de ese servidor, y nada de los demás", () => {
    file(join(BACKUPS, "svr2007", "a.tar.zst"));
    file(join(BACKUPS, "svr2007", "suelto-sin-fila.tar.zst"));
    file(join(BACKUPS, "minecraft", "m.tar.zst"));
    backupRows = [
      { id: 1, server_id: "svr2007", filename: "a.tar.zst", size_bytes: 100 },
      { id: 2, server_id: "minecraft", filename: "m.tar.zst", size_bytes: 50 },
    ];

    expect(deleteServerBackups("svr2007")).toEqual({ files: 1, bytes: 100 });

    expect(existsSync(join(BACKUPS, "svr2007"))).toBe(false);
    expect(existsSync(join(BACKUPS, "minecraft", "m.tar.zst"))).toBe(true);
    expect(backupRows.map((b) => b.server_id)).toEqual(["minecraft"]);
  });

  it.each([
    [""],
    ["."],
    [".."],
    ["../backups"],
    ["a/b"],
  ])("con un id raro (%j) no borra ninguna carpeta", (id) => {
    file(join(BACKUPS, "minecraft", "m.tar.zst"));
    deleteServerBackups(id);
    expect(existsSync(join(BACKUPS, "minecraft", "m.tar.zst"))).toBe(true);
    expect(existsSync(BACKUPS)).toBe(true);
  });
});

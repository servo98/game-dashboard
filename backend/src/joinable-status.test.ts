import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock docker before importing the module
const mockStreamContainerLogs = vi.fn(async function* () {});
const mockGetContainerStatus = vi.fn().mockResolvedValue("running");
const mockGetRunningGameServers = vi.fn().mockResolvedValue([]);
vi.mock("./docker", () => ({
  streamContainerLogs: (...a: unknown[]) => mockStreamContainerLogs(...(a as [])),
  getContainerStatus: (...a: unknown[]) => mockGetContainerStatus(...a),
  getRunningGameServers: (...a: unknown[]) => mockGetRunningGameServers(...a),
}));

const mockServerGetAll = vi.fn(() => [] as Array<{ id: string; docker_image: string }>);
vi.mock("./db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  serverQueries: { getAll: { all: () => mockServerGetAll() } },
}));

import {
  beginLogWatching,
  clearJoinable,
  getJoinableStatus,
  hasReadyPattern,
  isJoinableLine,
  reconcileJoinableOnBoot,
  setStarting,
  stopJoinableWatcher,
} from "./joinable-status";

describe("joinable-status", () => {
  it("isJoinableLine matches vanilla Done pattern", () => {
    expect(isJoinableLine('Done (25.3s)! For help, type "help"')).toBe(true);
  });

  it("isJoinableLine matches comma decimal locale", () => {
    expect(isJoinableLine('Done (25,3s)! For help, type "help"')).toBe(true);
  });

  it("isJoinableLine rejects 'Done loading X mods'", () => {
    expect(isJoinableLine("Done loading 142 mods")).toBe(false);
  });

  it("isJoinableLine rejects generic 'Done' lines", () => {
    expect(isJoinableLine("Done preparing spawn area")).toBe(false);
  });

  it("isJoinableLine matches desglosador api-ready line", () => {
    expect(isJoinableLine("[api] escuchando en http://localhost:3001 (IA: heurístico)")).toBe(true);
  });

  it("isJoinableLine matches valheim ready line", () => {
    expect(isJoinableLine("09/09/2026 16:53:55: Game server connected")).toBe(true);
  });

  it("isJoinableLine rejects valheim steam-init line", () => {
    expect(isJoinableLine("09/09/2026 16:52:02: Steam game server initialized")).toBe(false);
  });

  it("setStarting → status is 'starting'", () => {
    setStarting("test-server");
    expect(getJoinableStatus("test-server")).toBe("starting");
    // cleanup
    clearJoinable("test-server");
  });

  it("clearJoinable → status is null", () => {
    setStarting("test-server");
    clearJoinable("test-server");
    expect(getJoinableStatus("test-server")).toBeNull();
  });

  it("stopJoinableWatcher clears status", () => {
    setStarting("test-server");
    stopJoinableWatcher("test-server");
    expect(getJoinableStatus("test-server")).toBeNull();
  });

  it("getJoinableStatus returns null for unknown server", () => {
    expect(getJoinableStatus("unknown-server")).toBeNull();
  });
});

describe("hasReadyPattern", () => {
  it.each([
    "itzg/minecraft-server:java21",
    "lloesche/valheim-server:latest",
  ])("reconoce el arranque de %s en los logs", (image) => {
    expect(hasReadyPattern(image)).toBe(true);
  });

  it.each([
    "ghcr.io/servo98/reelsgame:latest",
    "ghcr.io/servo98/desglosador3000:latest",
    "felddy/foundryvtt:release",
    undefined,
  ])("no sabe leer el arranque de %s", (image) => {
    expect(hasReadyPattern(image)).toBe(false);
  });
});

/**
 * REGRESIÓN: el "listo" salía de una lista blanca de tres patrones de log. Una
 * imagen cualquiera (una app propia en GHCR) no casaba con ninguno y la tarjeta
 * se quedaba en "Arrancando" para siempre.
 */
describe("beginLogWatching — margen para imágenes desconocidas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetContainerStatus.mockResolvedValue("running");
  });

  afterEach(() => {
    stopJoinableWatcher("app");
    vi.useRealTimers();
  });

  it("marca listo una imagen desconocida que sigue en pie tras el margen", async () => {
    beginLogWatching("app", "ghcr.io/servo98/reelsgame:latest");
    expect(getJoinableStatus("app")).toBe("starting");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(getJoinableStatus("app")).toBe("joinable");
  });

  it("no la marca listo si el contenedor se cayó durante el margen", async () => {
    mockGetContainerStatus.mockResolvedValue("stopped");
    beginLogWatching("app", "ghcr.io/servo98/reelsgame:latest");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(getJoinableStatus("app")).toBe("starting");
  });

  it("no aplica margen a Minecraft: ahí solo vale su línea de log", async () => {
    beginLogWatching("app", "itzg/minecraft-server:java21");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getJoinableStatus("app")).toBe("starting");
  });

  it("parar la vigilancia cancela el margen pendiente", async () => {
    beginLogWatching("app", "ghcr.io/servo98/reelsgame:latest");
    stopJoinableWatcher("app");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(getJoinableStatus("app")).toBeNull();
  });
});

/**
 * REGRESIÓN: el mapa de estados vive en memoria, así que cada deploy del
 * backend dejaba en "En marcha" a los contenedores que ya estaban sirviendo.
 */
describe("reconcileJoinableOnBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const id of ["app", "mc", "otro"]) clearJoinable(id);
  });

  it("da por listo lo que ya corría con una imagen sin patrón conocido", async () => {
    mockGetRunningGameServers.mockResolvedValue([{ id: "app", name: "app", memoryBytes: 0 }]);
    mockServerGetAll.mockReturnValue([
      { id: "app", docker_image: "ghcr.io/servo98/reelsgame:latest" },
    ]);

    await reconcileJoinableOnBoot();
    expect(getJoinableStatus("app")).toBe("joinable");
  });

  it("no adivina con Minecraft: su línea de log ya se perdió", async () => {
    mockGetRunningGameServers.mockResolvedValue([{ id: "mc", name: "mc", memoryBytes: 0 }]);
    mockServerGetAll.mockReturnValue([{ id: "mc", docker_image: "itzg/minecraft-server:java21" }]);

    await reconcileJoinableOnBoot();
    expect(getJoinableStatus("mc")).toBeNull();
  });

  it("no pisa un estado que ya se conoce", async () => {
    setStarting("app");
    mockGetRunningGameServers.mockResolvedValue([{ id: "app", name: "app", memoryBytes: 0 }]);
    mockServerGetAll.mockReturnValue([
      { id: "app", docker_image: "ghcr.io/servo98/reelsgame:latest" },
    ]);

    await reconcileJoinableOnBoot();
    expect(getJoinableStatus("app")).toBe("starting");
  });

  it("ignora contenedores que no están en el panel", async () => {
    mockGetRunningGameServers.mockResolvedValue([{ id: "otro", name: "otro", memoryBytes: 0 }]);
    mockServerGetAll.mockReturnValue([]);

    await reconcileJoinableOnBoot();
    expect(getJoinableStatus("otro")).toBeNull();
  });

  it("no revienta si docker no responde", async () => {
    mockGetRunningGameServers.mockRejectedValue(new Error("docker caído"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reconcileJoinableOnBoot()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

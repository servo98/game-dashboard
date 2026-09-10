import { describe, expect, it, vi } from "vitest";

vi.mock("dockerode", () => ({
  default: class {
    getContainer() {
      return {};
    }
    listContainers() {
      return Promise.resolve([]);
    }
  },
}));

const { containerMemUsageBytes } = await import("./docker");

const MB = 1024 * 1024;

/**
 * REGRESIÓN: solo se restaba `stats.cache`, que existe en cgroup v1 y no en v2.
 * En el VPS (cgroup v2) no se restaba nada y la tarjeta del backend llegó a
 * marcar 1490 MB de 1536 MB tras un backup, con `docker stats` diciendo 279 MB.
 */
describe("containerMemUsageBytes", () => {
  it("resta el page cache en cgroup v1 (campo cache)", () => {
    const bytes = containerMemUsageBytes({
      usage: 1500 * MB,
      stats: { cache: 1200 * MB },
    });
    expect(bytes / MB).toBe(300);
  });

  it("resta inactive_file en cgroup v2, donde no hay campo cache", () => {
    const bytes = containerMemUsageBytes({
      usage: 1498 * MB,
      stats: { anon: 253 * MB, file: 1211 * MB, inactive_file: 1211 * MB },
    });
    expect(Math.round(bytes / MB)).toBe(287);
  });

  it("prefiere cache cuando vienen los dos", () => {
    const bytes = containerMemUsageBytes({
      usage: 1000 * MB,
      stats: { cache: 400 * MB, inactive_file: 900 * MB },
    });
    expect(bytes / MB).toBe(600);
  });

  it("devuelve el uso crudo si no hay ningún campo de caché", () => {
    expect(containerMemUsageBytes({ usage: 120 * MB, stats: {} }) / MB).toBe(120);
  });

  it("nunca devuelve negativo aunque el caché supere al uso", () => {
    expect(containerMemUsageBytes({ usage: 10 * MB, stats: { inactive_file: 50 * MB } })).toBe(0);
  });

  it("tolera que no venga memory_stats", () => {
    expect(containerMemUsageBytes(undefined)).toBe(0);
    expect(containerMemUsageBytes({})).toBe(0);
  });
});

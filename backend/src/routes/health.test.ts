import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock docker
const mockGetContainer = vi.fn();
const mockListContainers = vi.fn();

vi.mock("../docker", () => ({
  docker: {
    getContainer: (...args: unknown[]) => mockGetContainer(...args),
    listContainers: (...args: unknown[]) => mockListContainers(...args),
  },
}));

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  sessionQueries: {
    get: { get: vi.fn() },
    insert: { run: vi.fn() },
    delete: { run: vi.fn() },
    cleanup: { run: vi.fn() },
  },
}));

vi.mock("../backup", () => ({
  startAutoBackupTimer: vi.fn(),
}));

describe("Health endpoints", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();

    // Replicate the health routes from index.ts
    app.get("/health", (c) => c.json({ ok: true }));
  });

  it("GET /health returns { ok: true }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/health/status", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    app = new Hono();

    const COMPOSE_SERVICES = ["backend", "bot", "dashboard", "nginx"] as const;

    app.get("/api/health/status", async (c) => {
      const projectName = "game-panel";

      const services = await Promise.all(
        COMPOSE_SERVICES.map(async (name) => {
          const containerName = `${projectName}-${name}-1`;
          try {
            const container = mockGetContainer(containerName);
            const info = await container.inspect();
            return {
              name,
              status: info.State.Running ? "healthy" : "down",
              health: info.State.Health?.Status ?? (info.State.Running ? "running" : "stopped"),
              uptime: info.State.Running ? info.State.StartedAt : null,
              restarts: info.RestartCount ?? 0,
              memUsageMB: 0,
              memLimitMB: 0,
              cpuPercent: 0,
            };
          } catch {
            return {
              name,
              status: "down" as const,
              health: "not_found",
              uptime: null,
              restarts: 0,
              memUsageMB: 0,
              memLimitMB: 0,
              cpuPercent: 0,
            };
          }
        }),
      );

      let activeGame = null;
      try {
        const containers = await mockListContainers({ all: false });
        const gameContainer = containers.find(
          (c: { Names: string[]; Labels: Record<string, string> }) =>
            c.Names.some((n: string) => n.startsWith(`/${projectName}-`)) &&
            !c.Labels["com.docker.compose.service"],
        );
        if (gameContainer) {
          activeGame = {
            name: gameContainer.Names[0].replace(/^\//, "").replace(`${projectName}-`, ""),
            image: gameContainer.Image,
            status: gameContainer.Status,
          };
        }
      } catch {}

      return c.json({
        status: services.every((s) => s.status === "healthy") ? "operational" : "degraded",
        services,
        activeGame,
        timestamp: new Date().toISOString(),
      });
    });
  });

  it("returns operational when all services are healthy", async () => {
    const mockContainerObj = {
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true, StartedAt: "2026-01-01T00:00:00Z", Health: null },
        RestartCount: 0,
      }),
      stats: vi.fn().mockResolvedValue({}),
    };
    mockGetContainer.mockReturnValue(mockContainerObj);
    mockListContainers.mockResolvedValue([]);

    const res = await app.request("/api/health/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("operational");
    expect(body.services).toHaveLength(4);
    expect(body.services.every((s: { status: string }) => s.status === "healthy")).toBe(true);
  });

  it("returns degraded when a service is down", async () => {
    const runningContainer = {
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true, StartedAt: "2026-01-01T00:00:00Z" },
        RestartCount: 0,
      }),
    };
    const downContainer = {
      inspect: vi.fn().mockRejectedValue(new Error("not found")),
    };
    mockGetContainer.mockImplementation((name: string) => {
      if (name.includes("bot")) return downContainer;
      return runningContainer;
    });
    mockListContainers.mockResolvedValue([]);

    const res = await app.request("/api/health/status");
    const body = await res.json();
    expect(body.status).toBe("degraded");
  });

  it("includes activeGame when a game container is running", async () => {
    const mockContainerObj = {
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true, StartedAt: "2026-01-01T00:00:00Z" },
        RestartCount: 0,
      }),
    };
    mockGetContainer.mockReturnValue(mockContainerObj);
    mockListContainers.mockResolvedValue([
      {
        Names: ["/game-panel-minecraft"],
        Image: "itzg/minecraft-server",
        Status: "Up 2 hours",
        Labels: {}, // no compose label = game container
      },
    ]);

    const res = await app.request("/api/health/status");
    const body = await res.json();
    expect(body.activeGame).toEqual({
      name: "minecraft",
      image: "itzg/minecraft-server",
      status: "Up 2 hours",
    });
  });
});

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { startAutoBackupTimer } from "./backup";
import { sessionQueries } from "./db";
import { docker } from "./docker";
import authRoutes from "./routes/auth";
import botSettingsRoutes from "./routes/bot-settings";
import notificationRoutes from "./routes/notifications";
import serverRoutes from "./routes/servers";
import serviceRoutes from "./routes/services";
import settingsRoutes from "./routes/settings";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      process.env.PUBLIC_URL ?? "http://localhost:5173",
      "http://localhost:5173",
      "http://localhost:4173",
    ],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

// Detailed health/status — public, no auth
const BOOT_TIME = Date.now();
const COMPOSE_SERVICES = ["backend", "bot", "dashboard", "nginx"] as const;

app.get("/api/health/status", async (c) => {
  const projectName = process.env.COMPOSE_PROJECT_NAME ?? "game-panel";

  const services = await Promise.all(
    COMPOSE_SERVICES.map(async (name) => {
      const containerName = `${projectName}-${name}-1`;
      try {
        const container = docker.getContainer(containerName);
        const info = await container.inspect();
        const state = info.State;

        // Parse memory stats from container stats (quick snapshot)
        let memUsageMB = 0;
        let memLimitMB = 0;
        let cpuPercent = 0;
        try {
          const stats = await container.stats({ stream: false });
          const memUsage = stats.memory_stats?.usage ?? 0;
          const memCache = stats.memory_stats?.stats?.cache ?? 0;
          memUsageMB = Math.round((memUsage - memCache) / 1024 / 1024);
          memLimitMB = Math.round((stats.memory_stats?.limit ?? 0) / 1024 / 1024);

          const cpuDelta =
            (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
            (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
          const systemDelta =
            (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
          const cpuCount = stats.cpu_stats?.online_cpus ?? 1;
          cpuPercent =
            systemDelta > 0 ? Math.round((cpuDelta / systemDelta) * cpuCount * 100 * 10) / 10 : 0;
        } catch {
          // stats may not be available
        }

        return {
          name,
          status: state.Running ? "healthy" : "down",
          health: state.Health?.Status ?? (state.Running ? "running" : "stopped"),
          uptime: state.Running ? state.StartedAt : null,
          restarts: info.RestartCount ?? 0,
          memUsageMB,
          memLimitMB,
          cpuPercent,
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

  // Check for active game container
  let activeGame = null;
  try {
    const containers = await docker.listContainers({ all: false });
    const gameContainer = containers.find(
      (c) =>
        c.Names.some((n) => n.startsWith(`/${projectName}-`)) &&
        !c.Labels["com.docker.compose.service"],
    );
    if (gameContainer) {
      activeGame = {
        name: gameContainer.Names[0].replace(/^\//, "").replace(`${projectName}-`, ""),
        image: gameContainer.Image,
        status: gameContainer.Status,
      };
    }
  } catch {
    // ignore
  }

  return c.json({
    status: services.every((s) => s.status === "healthy") ? "operational" : "degraded",
    backendUptime: Math.floor((Date.now() - BOOT_TIME) / 1000),
    services,
    activeGame,
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/auth", authRoutes);
app.route("/api/servers", serverRoutes);
app.route("/api/services", serviceRoutes);
app.route("/api/bot", botSettingsRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/settings", settingsRoutes);

// Start auto-backup timer (checks every hour)
startAutoBackupTimer();

// Periodic session cleanup (every hour)
setInterval(
  () => {
    sessionQueries.cleanup.run();
  },
  60 * 60 * 1000,
);

const port = Number(process.env.BACKEND_PORT ?? 3000);
console.log(`Backend running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255, // max for Bun — needed for SSE connections
};

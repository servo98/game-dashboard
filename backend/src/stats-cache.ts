import { docker } from "./docker";

const COMPOSE_SERVICES = ["backend", "bot", "dashboard", "nginx"] as const;

export type ServiceStats = {
  memUsageMB: number;
  memLimitMB: number;
  cpuPercent: number;
};

const cache = new Map<string, ServiceStats>();

const EMPTY_STATS: ServiceStats = { memUsageMB: 0, memLimitMB: 0, cpuPercent: 0 };

/** Get cached stats for a compose service (returns zeros if not yet fetched) */
export function getCachedStats(serviceName: string): ServiceStats {
  return cache.get(serviceName) ?? EMPTY_STATS;
}

async function refreshStats(): Promise<void> {
  const projectName = process.env.COMPOSE_PROJECT_NAME ?? "game-panel";

  await Promise.allSettled(
    COMPOSE_SERVICES.map(async (name) => {
      const containerName = `${projectName}-${name}-1`;
      try {
        const container = docker.getContainer(containerName);
        const stats = await container.stats({ stream: false });

        const memUsage = stats.memory_stats?.usage ?? 0;
        const memCache = stats.memory_stats?.stats?.cache ?? 0;
        const memUsageMB = Math.round((memUsage - memCache) / 1024 / 1024);
        const memLimitMB = Math.round((stats.memory_stats?.limit ?? 0) / 1024 / 1024);

        const cpuDelta =
          (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
          (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
        const systemDelta =
          (stats.cpu_stats?.system_cpu_usage ?? 0) -
          (stats.precpu_stats?.system_cpu_usage ?? 0);
        const cpuCount = stats.cpu_stats?.online_cpus ?? 1;
        const cpuPercent =
          systemDelta > 0
            ? Math.round((cpuDelta / systemDelta) * cpuCount * 100 * 10) / 10
            : 0;

        cache.set(name, { memUsageMB, memLimitMB, cpuPercent });
      } catch {
        // Container may not exist — leave previous value or set zeros
        if (!cache.has(name)) cache.set(name, EMPTY_STATS);
      }
    }),
  );
}

/** Start the background stats refresh loop (every 10s) */
export function startStatsCache(): void {
  // Initial fetch
  refreshStats();
  setInterval(refreshStats, 10_000);
}

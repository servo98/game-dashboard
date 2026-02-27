import Dockerode from "dockerode";

export const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });

const GAME_NETWORK = "game-panel";
const CONTAINER_PREFIX = "game-panel-";

export function gameContainerName(serverId: string) {
  return `${CONTAINER_PREFIX}${serverId}`;
}

/** Ensure the game-panel Docker network exists */
export async function ensureNetwork() {
  const networks = await docker.listNetworks({ filters: { name: [GAME_NETWORK] } });
  if (networks.length === 0) {
    await docker.createNetwork({ Name: GAME_NETWORK, Driver: "bridge" });
  }
}

/** Return the currently running game container (if any) */
export async function getActiveContainer(): Promise<{ id: string; name: string } | null> {
  const containers = await docker.listContainers({ all: false });
  const active = containers.find((c) =>
    c.Names.some((n) => n.startsWith(`/${CONTAINER_PREFIX}`))
  );
  if (!active) return null;
  const serverId = active.Names[0].replace(`/${CONTAINER_PREFIX}`, "");
  return { id: active.Id, name: serverId };
}

/** Get status of a specific game container */
export async function getContainerStatus(serverId: string): Promise<
  "running" | "stopped" | "missing"
> {
  const containers = await docker.listContainers({ all: true });
  const found = containers.find((c) =>
    c.Names.some((n) => n === `/${gameContainerName(serverId)}`)
  );
  if (!found) return "missing";
  if (found.State === "running") return "running";
  return "stopped";
}

// --- Crash watcher ---

const activeWatchers = new Map<string, ReturnType<typeof setInterval>>();
const intentionalStops = new Set<string>();

/** Register a watcher that calls onCrash() if the container stops unexpectedly */
export function watchContainer(serverId: string, onCrash: () => void): void {
  const existing = activeWatchers.get(serverId);
  if (existing) clearInterval(existing);
  intentionalStops.delete(serverId);

  const interval = setInterval(async () => {
    try {
      const status = await getContainerStatus(serverId);
      if (status !== "running") {
        clearInterval(interval);
        activeWatchers.delete(serverId);
        if (!intentionalStops.has(serverId)) {
          onCrash();
        }
        intentionalStops.delete(serverId);
      }
    } catch {
      // ignore transient errors
    }
  }, 30_000);

  activeWatchers.set(serverId, interval);
}

/** Mark a stop as intentional so the watcher doesn't fire onCrash */
export function markIntentionalStop(serverId: string): void {
  intentionalStops.add(serverId);
  const watcher = activeWatchers.get(serverId);
  if (watcher) {
    clearInterval(watcher);
    activeWatchers.delete(serverId);
  }
}

/** Start a game container. Stops any currently running game container first. */
export async function startGameContainer(
  serverId: string,
  image: string,
  port: number,
  envVars: Record<string, string>,
  volumes: Record<string, string>
): Promise<void> {
  await ensureNetwork();

  // Stop any currently running game container
  const active = await getActiveContainer();
  if (active) {
    await stopGameContainer(active.name);
  }

  const containerName = gameContainerName(serverId);

  // Remove existing stopped container if present
  try {
    const existing = docker.getContainer(containerName);
    await existing.remove({ force: true });
  } catch {
    // Container doesn't exist, that's fine
  }

  // Resolve ${VAR} placeholders from process.env
  const resolvedEnv = Object.fromEntries(
    Object.entries(envVars).map(([k, v]) => [
      k,
      v.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? ""),
    ])
  );

  // Build env array
  const env = Object.entries(resolvedEnv).map(([k, v]) => `${k}=${v}`);

  // Build port bindings
  const portStr = `${port}/udp`;
  const portTcpStr = `${port}/tcp`;

  // Build volume bindings: host_path -> container_path
  const binds = Object.entries(volumes).map(([host, container]) => `${host}:${container}`);

  // Pull image if not present locally
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  const container = await docker.createContainer({
    name: containerName,
    Image: image,
    Env: env,
    ExposedPorts: {
      [portTcpStr]: {},
      [portStr]: {},
    },
    HostConfig: {
      PortBindings: {
        [portTcpStr]: [{ HostPort: String(port) }],
        [portStr]: [{ HostPort: String(port), HostIp: "0.0.0.0" }],
      },
      Binds: binds,
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: GAME_NETWORK,
      // Resource limits — deja 1 vCPU + 1 GB para backend/nginx
      Memory: 6 * 1024 * 1024 * 1024,       // 6 GB máx
      MemoryReservation: 512 * 1024 * 1024,  // 512 MB garantizados
      NanoCpus: 3 * 1e9,                     // 3 vCPUs máx
      // Log rotation — máx 150 MB por juego (3 × 50 MB)
      LogConfig: {
        Type: "json-file",
        Config: {
          "max-size": "50m",
          "max-file": "3",
        },
      },
    },
  });

  await container.start();
}

/** Stop and remove a game container */
export async function stopGameContainer(serverId: string): Promise<void> {
  const containerName = gameContainerName(serverId);
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop({ t: 10 });
    }
    await container.remove();
  } catch {
    // Container already gone
  }
}

/** Stream logs from a game container as an async generator */
export async function* streamContainerLogs(
  serverId: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  const containerName = gameContainerName(serverId);
  const container = docker.getContainer(containerName);

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100,
  });

  // dockerode returns a raw stream; we read it chunk by chunk
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    if (signal.aborted) break;
    // Docker log format has an 8-byte header per frame
    // header[0]: stream type (1=stdout, 2=stderr)
    // header[4..7]: frame size (big-endian uint32)
    let offset = 0;
    while (offset < chunk.length) {
      if (chunk.length - offset < 8) break;
      const size = chunk.readUInt32BE(offset + 4);
      const text = chunk.slice(offset + 8, offset + 8 + size).toString("utf8");
      yield text;
      offset += 8 + size;
    }
  }
}

/** Stream CPU/RAM stats from a game container as an async generator */
export async function* streamContainerStats(
  serverId: string,
  signal: AbortSignal
): AsyncGenerator<{ cpuPercent: number; memUsageMB: number; memLimitMB: number }> {
  const containerName = gameContainerName(serverId);
  const container = docker.getContainer(containerName);

  // @ts-ignore — dockerode typings don't expose the stream overload cleanly
  const stream = (await container.stats({ stream: true })) as NodeJS.ReadableStream;

  let buffer = "";

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    if (signal.aborted) break;
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const s = JSON.parse(line);
        const cpuDelta =
          s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
        const systemDelta =
          (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
        const numCpus =
          s.cpu_stats.online_cpus ??
          s.cpu_stats.cpu_usage.percpu_usage?.length ??
          1;
        const cpuPercent =
          systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;
        const memUsageMB = (s.memory_stats.usage ?? 0) / 1024 / 1024;
        const memLimitMB = (s.memory_stats.limit ?? 0) / 1024 / 1024;

        yield {
          cpuPercent: Math.max(0, Math.min(cpuPercent, 100)),
          memUsageMB,
          memLimitMB,
        };
      } catch {
        // Ignore parse errors
      }
    }
  }
}

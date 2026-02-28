import Dockerode from "dockerode";
import { getPanelSetting } from "./db";

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
  // Filter to game containers only — exclude Compose-managed services
  // (Compose containers have the "com.docker.compose.service" label)
  const active = containers.find((c) =>
    c.Names.some((n) => n.startsWith(`/${CONTAINER_PREFIX}`)) &&
    !c.Labels["com.docker.compose.service"]
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
      // Resource limits from panel settings
      Memory: Number(getPanelSetting("game_memory_limit_gb")) * 1024 * 1024 * 1024,
      MemoryReservation: 512 * 1024 * 1024,  // 512 MB guaranteed
      NanoCpus: Number(getPanelSetting("game_cpu_limit")) * 1e9,
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

/** Stop a game container (does NOT remove it — removal happens on next start) */
export async function stopGameContainer(serverId: string): Promise<void> {
  const containerName = gameContainerName(serverId);
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop({ t: 10 });
    }
  } catch {
    // Container already gone
  }
}

// --- Internal stream helpers ---

function formatLogLine(raw: string): string {
  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z\s?/);
  if (tsMatch) {
    const msg = raw.slice(tsMatch[0].length);
    return `${tsMatch[1]}Z\t${msg}`; // ISO timestamp + tab + message
  }
  return raw;
}

async function* _streamLogs(containerName: string, signal: AbortSignal): AsyncGenerator<string> {
  const container = docker.getContainer(containerName);
  const info = await container.inspect();
  const isTty = info.Config.Tty;

  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: 100,
  });

  // Destroy the stream when the request is aborted so for-await exits
  const onAbort = () => { try { (logStream as any).destroy?.(); } catch {} };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    if (isTty) {
      // TTY: plain text stream — iterate directly
      for await (const chunk of logStream as AsyncIterable<Buffer>) {
        if (signal.aborted) break;
        const text = chunk.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trimEnd();
          if (trimmed) yield formatLogLine(trimmed);
        }
      }
    } else {
      // Multiplexed: manually parse Docker stream header format
      // Each frame: [1 byte stream type][3 bytes padding][4 bytes payload length BE][payload]
      let buf = Buffer.alloc(0);
      for await (const chunk of logStream as AsyncIterable<Buffer>) {
        if (signal.aborted) break;
        buf = Buffer.concat([buf, chunk]);

        // Process all complete frames in the buffer
        while (buf.length >= 8) {
          const payloadLen = buf.readUInt32BE(4);
          const frameSize = 8 + payloadLen;
          if (buf.length < frameSize) break; // incomplete frame, wait for more data

          const payload = buf.subarray(8, frameSize).toString("utf8");
          buf = buf.subarray(frameSize);

          for (const line of payload.split("\n")) {
            const trimmed = line.trimEnd();
            if (trimmed) yield formatLogLine(trimmed);
          }
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try { (logStream as any).destroy?.(); } catch {}
  }
}

async function* _streamStats(
  containerName: string,
  signal: AbortSignal
): AsyncGenerator<{ cpuPercent: number; memUsageMB: number; memLimitMB: number }> {
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

// --- Public stream functions ---

/** Stream logs from a game container */
export async function* streamContainerLogs(
  serverId: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  yield* _streamLogs(gameContainerName(serverId), signal);
}

/** Stream CPU/RAM stats from a game container */
export async function* streamContainerStats(
  serverId: string,
  signal: AbortSignal
): AsyncGenerator<{ cpuPercent: number; memUsageMB: number; memLimitMB: number }> {
  yield* _streamStats(gameContainerName(serverId), signal);
}

/** Stream logs from a compose service */
export async function* streamServiceLogs(
  serviceName: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  const projectName = process.env.COMPOSE_PROJECT_NAME ?? "game-panel";
  yield* _streamLogs(`${projectName}-${serviceName}-1`, signal);
}

/** Stream CPU/RAM stats from a compose service */
export async function* streamServiceStats(
  serviceName: string,
  signal: AbortSignal
): AsyncGenerator<{ cpuPercent: number; memUsageMB: number; memLimitMB: number }> {
  const projectName = process.env.COMPOSE_PROJECT_NAME ?? "game-panel";
  yield* _streamStats(`${projectName}-${serviceName}-1`, signal);
}

export type HostStats = {
  cpuPercent: number;
  memUsageMB: number;
  memTotalMB: number;
  diskUsedGB: number;
  diskTotalGB: number;
};

/** Stream host-level stats (CPU, RAM, Disk) every 3s */
export async function* streamHostStats(signal: AbortSignal): AsyncGenerator<HostStats> {
  let prevIdle = 0;
  let prevTotal = 0;

  while (!signal.aborted) {
    try {
      // CPU from /proc/stat
      const statContent = await Bun.file("/proc/stat").text();
      const cpuLine = statContent.split("\n").find((l) => l.startsWith("cpu "));
      let cpuPercent = 0;
      if (cpuLine) {
        const parts = cpuLine.split(/\s+/).slice(1).map(Number);
        const idle = parts[3] + (parts[4] ?? 0); // idle + iowait
        const total = parts.reduce((a, b) => a + b, 0);
        if (prevTotal > 0) {
          const deltaTotal = total - prevTotal;
          const deltaIdle = idle - prevIdle;
          cpuPercent = deltaTotal > 0 ? ((deltaTotal - deltaIdle) / deltaTotal) * 100 : 0;
        }
        prevIdle = idle;
        prevTotal = total;
      }

      // RAM from /proc/meminfo
      const meminfoContent = await Bun.file("/proc/meminfo").text();
      const memLines = Object.fromEntries(
        meminfoContent
          .split("\n")
          .filter((l) => l.includes(":"))
          .map((l) => {
            const [key, rest] = l.split(":");
            return [key.trim(), parseInt(rest.trim()) / 1024]; // kB -> MB
          })
      );
      const memTotalMB = memLines["MemTotal"] ?? 0;
      const memAvailableMB = memLines["MemAvailable"] ?? 0;
      const memUsageMB = memTotalMB - memAvailableMB;

      // Disk from df
      const dfResult = Bun.spawnSync(["df", "-B1", "/data"]);
      let diskUsedGB = 0;
      let diskTotalGB = 0;
      const dfOutput = dfResult.stdout.toString();
      const dfLines = dfOutput.trim().split("\n");
      if (dfLines.length >= 2) {
        const cols = dfLines[1].split(/\s+/);
        diskTotalGB = parseInt(cols[1]) / 1024 / 1024 / 1024;
        diskUsedGB = parseInt(cols[2]) / 1024 / 1024 / 1024;
      }

      yield {
        cpuPercent: Math.max(0, Math.min(cpuPercent, 100)),
        memUsageMB,
        memTotalMB,
        diskUsedGB,
        diskTotalGB,
      };
    } catch {
      // Ignore errors, retry next cycle
    }

    // Wait 3s
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

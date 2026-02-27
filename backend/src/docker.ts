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

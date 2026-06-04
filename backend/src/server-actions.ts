import { createBackup } from "./backup";
import { findTemplateByImage } from "./catalog";
import { botSettingsQueries, type Server, serverQueries, serverSessionQueries } from "./db";
import {
  getActiveContainer,
  getContainerStatus,
  markIntentionalStop,
  startGameContainer,
  stopGameContainer,
  watchContainer,
} from "./docker";
import { beginLogWatching, stopJoinableWatcher } from "./joinable-status";

// ─── Result type ────────────────────────────────────────────────────────────
// Devuelve un resultado tipado para que el MCP lo mapee a successResult/errorResult
// y las rutas HTTP lo mapeen a códigos de estado.
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "not_found" | "invalid" | "backup_failed" | "docker" };

// ─── Helper: resolución de parámetros de arranque ────────────────────────────
// Puro (salvo el side-effect de persistir volúmenes auto-arreglados): produce la
// imagen/env/volúmenes ya procesados para una fila de servidor. NO toca contenedores.
function resolveStartParams(
  server: Server,
  id: string,
): { image: string; env: Record<string, string>; volumes: Record<string, string> } {
  const envVars = JSON.parse(server.env_vars) as Record<string, string>;
  let volumes = JSON.parse(server.volumes) as Record<string, string>;

  // Asegura que el servidor siempre tenga un volumen — auto-arregla servidores legacy sin uno
  if (Object.keys(volumes).length === 0) {
    // Intenta emparejar la imagen Docker con una plantilla del catálogo para volúmenes correctos
    const template = findTemplateByImage(server.docker_image);
    if (template) {
      // Usa los volúmenes del catálogo pero sustituye el ID del servidor en los host paths
      volumes = Object.fromEntries(
        Object.entries(template.default_volumes).map(([host, container]) => [
          host.replace(new RegExp(`/${template.id}(/|$)`), `/${id}$1`),
          container,
        ]),
      );
    } else {
      volumes = { [`/data/${id}`]: "/data" };
    }
    serverQueries.update.run(
      server.name,
      server.port,
      server.docker_image,
      server.env_vars,
      JSON.stringify(volumes),
      id,
    );
  }

  // Modpacks: auto-detecta versión desde el manifest del modpack, no la sobreescribas
  const MODPACK_TYPES = new Set(["AUTO_CURSEFORGE", "MODRINTH", "FTBA"]);
  if (MODPACK_TYPES.has(envVars.TYPE)) {
    delete envVars.VERSION;
  }

  // Inyecta CF_API_KEY desde el env del backend cuando se usan modpacks de CurseForge
  if (envVars.TYPE === "AUTO_CURSEFORGE" && process.env.CF_API_KEY) {
    envVars.CF_API_KEY = process.env.CF_API_KEY;
  }

  // Auto-inyecta SERVER_PORT para servidores Minecraft cuando se usa un puerto no por defecto
  // Esto asegura que itzg/minecraft-server se enlace al puerto correcto con host networking
  if (server.game_type === "minecraft" && server.port !== 25565 && !envVars.SERVER_PORT) {
    envVars.SERVER_PORT = String(server.port);
  }

  // Auto-selecciona el tag de imagen Java para itzg/minecraft-server según la versión de MC
  let dockerImage = server.docker_image;
  if (dockerImage.startsWith("itzg/minecraft-server")) {
    // Si la DB ya tiene un tag explícito (p. ej. java21), respétalo
    const existingTag = dockerImage.includes(":") ? dockerImage.split(":")[1] : null;
    const hasExplicitJavaTag = existingTag && /^java\d+$/.test(existingTag);

    if (hasExplicitJavaTag) {
      // El usuario eligió una versión específica de Java en la config — no la sobreescribas
      dockerImage = `itzg/minecraft-server:${existingTag}`;
    } else {
      const version = envVars.VERSION ?? "LATEST";
      const parts = version.split(".").map(Number);
      const minor = parts[1] ?? 0;
      const patch = parts[2] ?? 0;
      let javaTag = "java21"; // por defecto para latest/moderno
      if (version !== "LATEST" && version !== "SNAPSHOT") {
        if (minor >= 21 || (minor === 20 && patch >= 5)) javaTag = "java21";
        else if (minor >= 18) javaTag = "java17";
        else javaTag = "java8";
      }
      dockerImage = `itzg/minecraft-server:${javaTag}`;
    }
  }

  return { image: dockerImage, env: envVars, volumes };
}

// ─── startServer ─────────────────────────────────────────────────────────────
/** Orquestación completa de arranque (tag Java, CF_API_KEY, puerto, volúmenes, sesión, watchers). */
export async function startServer(
  id: string,
): Promise<ActionResult<{ serverId: string; image: string }>> {
  const server = serverQueries.getById.get(id);
  if (!server) return { ok: false, code: "not_found", error: `Server "${id}" not found.` };

  const { image, env, volumes } = resolveStartParams(server, id);

  try {
    // Marca la sesión de cualquier servidor en ejecución como reemplazada
    const active = await getActiveContainer();
    if (active) {
      stopJoinableWatcher(active.name);
      markIntentionalStop(active.name);
      serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), "replaced", active.name);
    }

    await startGameContainer(server.id, image, server.port, env, volumes);

    // Registra la nueva sesión
    serverSessionQueries.start.run(server.id, Math.floor(Date.now() / 1000));

    // Observa los logs buscando la línea "Done" para detectar cuándo el servidor es joinable
    beginLogWatching(server.id);

    // Observa paradas inesperadas (caídas)
    const serverName = server.name;
    const serverId = server.id;
    watchContainer(serverId, async () => {
      serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), "crash", serverId);

      const embed = {
        title: "🔴 Servidor caído",
        description: `El servidor **${serverName}** se ha detenido inesperadamente.`,
        color: 15158332,
        timestamp: new Date().toISOString(),
      };

      // Intenta primero el canal de crashes configurado
      const crashChannelRow = botSettingsQueries.get.get("crashes_channel_id");
      const botToken = process.env.DISCORD_BOT_TOKEN;

      if (crashChannelRow?.value && botToken) {
        try {
          await fetch(`https://discord.com/api/v10/channels/${crashChannelRow.value}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ embeds: [embed] }),
          });
          return; // enviado vía bot API, omite el fallback de webhook
        } catch (err) {
          console.error("Failed to send crash notification via bot:", err);
        }
      }

      // Fallback a webhook
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
          });
        } catch (err) {
          console.error("Failed to send crash webhook:", err);
        }
      }
    });

    return { ok: true, data: { serverId: server.id, image } };
  } catch (err) {
    return { ok: false, code: "docker", error: (err as Error).message };
  }
}

// ─── stopServer ──────────────────────────────────────────────────────────────
/**
 * Detiene un servidor concreto por id (joinable watcher + parada intencional + parada de
 * contenedor + cierre de sesión). Si `opts.backup` es true y el servidor está corriendo,
 * hace backup primero y aborta con `backup_failed` si este falla.
 */
export async function stopServer(
  id: string,
  reason = "user",
  opts: { backup?: boolean } = {},
): Promise<ActionResult<{ serverId: string }>> {
  // Backup antes de parar (solo si corre y se pidió). Un servidor parado no tiene
  // nada vivo que respaldar, así que se omite.
  if (opts.backup) {
    const status = await getContainerStatus(id);
    if (status === "running") {
      try {
        await createBackup(id);
      } catch (err) {
        return {
          ok: false,
          code: "backup_failed",
          error: `Backup failed before stopping: ${(err as Error).message}`,
        };
      }
    }
  }

  try {
    stopJoinableWatcher(id);
    markIntentionalStop(id);
    await stopGameContainer(id);
    serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), reason, id);
    return { ok: true, data: { serverId: id } };
  } catch (err) {
    return { ok: false, code: "docker", error: (err as Error).message };
  }
}

// ─── updateServerConfig ──────────────────────────────────────────────────────
/**
 * Merge-patch de env_vars y/o cambio de docker_image solo en la DB (surte efecto en el siguiente arranque).
 * Hace backup primero cuando `backup` es true (por defecto true para llamadas destructivas del MCP).
 */
export async function updateServerConfig(
  id: string,
  patch: { docker_image?: string; env_vars?: Record<string, string | null> },
  opts: { backup?: boolean } = {},
): Promise<ActionResult<{ env_vars: Record<string, string>; docker_image: string }>> {
  const server = serverQueries.getById.get(id);
  if (!server) return { ok: false, code: "not_found", error: `Server "${id}" not found.` };

  // Backup antes de modificar (a menos que se desactive explícitamente)
  if (opts.backup !== false) {
    try {
      await createBackup(id);
    } catch (err) {
      return {
        ok: false,
        code: "backup_failed",
        error: `Backup failed before update: ${(err as Error).message}`,
      };
    }
  }

  // Merge de env_vars sobre los existentes; null elimina la clave
  const cur = JSON.parse(server.env_vars) as Record<string, string>;
  if (patch.env_vars) {
    for (const [key, value] of Object.entries(patch.env_vars)) {
      if (value === null) {
        delete cur[key];
      } else {
        cur[key] = String(value);
      }
    }
  }

  const dockerImage = patch.docker_image ?? server.docker_image;

  serverQueries.update.run(
    server.name,
    server.port,
    dockerImage,
    JSON.stringify(cur),
    server.volumes,
    id,
  );

  return { ok: true, data: { env_vars: cur, docker_image: dockerImage } };
}

// ─── restartServer ───────────────────────────────────────────────────────────
/** restart = (backup si está corriendo) → stopServer(id,"restart") si corre → startServer(id). */
export async function restartServer(
  id: string,
  opts: { backup?: boolean } = {},
): Promise<ActionResult<{ serverId: string; image: string }>> {
  const server = serverQueries.getById.get(id);
  if (!server) return { ok: false, code: "not_found", error: `Server "${id}" not found.` };

  const status = await getContainerStatus(id);
  const isRunning = status === "running";

  // Backup una sola vez al inicio si el servidor corre (evita doble backup en el stop interno)
  if (isRunning && opts.backup !== false) {
    try {
      await createBackup(id);
    } catch (err) {
      return {
        ok: false,
        code: "backup_failed",
        error: `Backup failed before restart: ${(err as Error).message}`,
      };
    }
  }

  // Si está corriendo, párralo primero (sin backup, ya lo hicimos arriba)
  if (isRunning) {
    const stopped = await stopServer(id, "restart");
    if (!stopped.ok) return stopped;
  }

  // Arranca (= start si estaba parado)
  return startServer(id);
}

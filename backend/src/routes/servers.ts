import { existsSync } from "fs";
import { Hono } from "hono";
import { createBackup, deleteBackupFile, getBackupFilePath, restoreBackup } from "../backup";
import { findTemplate, GAME_CATALOG } from "../catalog";
import type { Session } from "../db";
import { backupQueries, botSettingsQueries, serverQueries, serverSessionQueries } from "../db";
import {
  getActiveContainer,
  getContainerStatus,
  markIntentionalStop,
  startGameContainer,
  stopGameContainer,
  streamContainerLogs,
  streamContainerStats,
  watchContainer,
} from "../docker";
import { requireAuth } from "../middleware/auth";

const servers = new Hono<{ Variables: { session: Session } }>();

// Game catalog — public
servers.get("/catalog", (c) => {
  const search = c.req.query("search")?.toLowerCase();
  if (search) {
    const filtered = GAME_CATALOG.filter(
      (t) => t.name.toLowerCase().includes(search) || t.id.toLowerCase().includes(search),
    );
    return c.json(filtered);
  }
  return c.json(GAME_CATALOG);
});

// Create a new server from catalog template or custom config
servers.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    template_id?: string;
    id?: string;
    name?: string;
    game_type?: string;
    docker_image?: string;
    port?: number;
    env_vars?: Record<string, string>;
    volumes?: Record<string, string>;
  }>();

  let id: string;
  let name: string;
  let game_type: string;
  let docker_image: string;
  let port: number;
  let env_vars: Record<string, string>;
  let volumes: Record<string, string>;

  if (body.template_id) {
    const template = findTemplate(body.template_id);
    if (!template) return c.json({ error: "Template not found" }, 404);

    id = body.id ?? template.id;
    name = body.name ?? template.name;
    game_type = template.category;
    docker_image = body.docker_image ?? template.docker_image;
    port = body.port ?? template.default_port;
    env_vars = { ...template.default_env, ...(body.env_vars ?? {}) };
    volumes = { ...template.default_volumes, ...(body.volumes ?? {}) };
  } else {
    if (!body.id || !body.name || !body.docker_image || !body.port) {
      return c.json({ error: "Missing required fields: id, name, docker_image, port" }, 400);
    }
    id = body.id;
    name = body.name;
    game_type = body.game_type ?? "other";
    docker_image = body.docker_image;
    port = body.port;
    env_vars = body.env_vars ?? {};
    volumes = body.volumes ?? {};
  }

  // Validate id format
  if (!/^[a-z0-9_-]+$/.test(id)) {
    return c.json(
      { error: "Server ID must only contain lowercase letters, numbers, hyphens, and underscores" },
      400,
    );
  }

  // Check uniqueness
  const existing = serverQueries.getById.get(id);
  if (existing) return c.json({ error: "A server with this ID already exists" }, 409);

  // Check port conflict
  const allServers = serverQueries.getAll.all();
  const portConflict = allServers.find((s) => s.port === port);
  if (portConflict) {
    return c.json({ error: `Port ${port} is already used by ${portConflict.name}` }, 409);
  }

  try {
    serverQueries.insert.run(
      id,
      name,
      game_type,
      docker_image,
      port,
      JSON.stringify(env_vars),
      JSON.stringify(volumes),
    );
    return c.json({ ok: true });
  } catch (_err) {
    return c.json({ error: "Failed to create server" }, 500);
  }
});

// Delete a server — only when stopped
servers.delete("/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const status = await getContainerStatus(id);
  if (status === "running") {
    return c.json({ error: "Cannot delete a running server. Stop it first." }, 400);
  }

  serverSessionQueries.deleteByServerId.run(id);
  serverQueries.deleteById.run(id);

  return c.json({ ok: true });
});

// Both dashboard users and bot can list servers
servers.get("/", async (c) => {
  const rows = serverQueries.getAll.all();
  const result = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      game_type: row.game_type,
      port: row.port,
      status: await getContainerStatus(row.id),
      banner_path: row.banner_path ?? null,
      accent_color: row.accent_color ?? null,
    })),
  );
  return c.json(result);
});

// Start a game server — auth required (dashboard) OR bot key
servers.post("/:id/start", async (c) => {
  const botKey = c.req.header("X-Bot-Api-Key");
  const isBotRequest = botKey && botKey === process.env.BOT_API_KEY;

  if (!isBotRequest) {
    const token =
      c.req.header("Authorization")?.replace("Bearer ", "") ?? getCookie(c.req.raw, "session");
    if (!token) return c.json({ error: "Unauthorized" }, 401);

    const { sessionQueries: sq } = await import("../db");
    const session = sq.get.get(token);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const envVars = JSON.parse(server.env_vars) as Record<string, string>;
  const volumes = JSON.parse(server.volumes) as Record<string, string>;

  try {
    // Mark any currently running server's session as replaced
    const active = await getActiveContainer();
    if (active) {
      markIntentionalStop(active.name);
      serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), "replaced", active.name);
    }

    await startGameContainer(server.id, server.docker_image, server.port, envVars, volumes);

    // Record new session
    serverSessionQueries.start.run(server.id, Math.floor(Date.now() / 1000));

    // Watch for unexpected stops (crashes)
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

      // Try configured crash channel first
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
          return; // sent via bot API, skip webhook fallback
        } catch (err) {
          console.error("Failed to send crash notification via bot:", err);
        }
      }

      // Fallback to webhook
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

    return c.json({ ok: true, message: `${server.name} started` });
  } catch (err) {
    console.error("Start error:", err);
    return c.json({ error: "Failed to start server" }, 500);
  }
});

// Stop active game server
servers.post("/:id/stop", async (c) => {
  const botKey = c.req.header("X-Bot-Api-Key");
  const isBotRequest = botKey && botKey === process.env.BOT_API_KEY;

  if (!isBotRequest) {
    const token =
      c.req.header("Authorization")?.replace("Bearer ", "") ?? getCookie(c.req.raw, "session");
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const { sessionQueries: sq } = await import("../db");
    const session = sq.get.get(token);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();

  // Special "active" pseudo-id
  if (id === "active") {
    const active = await getActiveContainer();
    if (!active) return c.json({ ok: true, message: "No server running" });
    markIntentionalStop(active.name);
    await stopGameContainer(active.name);
    serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), "user", active.name);
    return c.json({ ok: true, message: `${active.name} stopped` });
  }

  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  try {
    markIntentionalStop(id);
    await stopGameContainer(id);
    serverSessionQueries.stop.run(Math.floor(Date.now() / 1000), "user", id);
    return c.json({ ok: true, message: `${server.name} stopped` });
  } catch (err) {
    console.error("Stop error:", err);
    return c.json({ error: "Failed to stop server" }, 500);
  }
});

// Live logs via Server-Sent Events
servers.get("/:id/logs", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const status = await getContainerStatus(id);
  if (status !== "running") {
    return c.json({ error: "Server is not running" }, 400);
  }

  const abortController = new AbortController();

  c.req.raw.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const line of streamContainerLogs(id, abortController.signal)) {
          if (abortController.signal.aborted) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
        }
      } catch (_err) {
        if (!abortController.signal.aborted) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify("[Log stream ended]")}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

// Real-time CPU/RAM stats via Server-Sent Events
servers.get("/:id/stats", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const status = await getContainerStatus(id);
  if (status !== "running") {
    return c.json({ error: "Server is not running" }, 400);
  }

  const abortController = new AbortController();

  c.req.raw.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const stats of streamContainerStats(id, abortController.signal)) {
          if (abortController.signal.aborted) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
        }
      } catch (_err) {
        if (!abortController.signal.aborted) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stats stream ended" })}\n\n`),
          );
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

// Get editable config for a server
servers.get("/:id/config", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  return c.json({
    docker_image: server.docker_image,
    env_vars: JSON.parse(server.env_vars) as Record<string, string>,
    banner_path: server.banner_path ?? null,
    accent_color: server.accent_color ?? null,
  });
});

// Update editable config for a server
servers.put("/:id/config", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const body = await c.req.json<{
    docker_image: string;
    env_vars: Record<string, string>;
    accent_color?: string | null;
  }>();

  serverQueries.update.run(body.docker_image, JSON.stringify(body.env_vars), id);

  // Update theme accent color if provided
  if (body.accent_color !== undefined) {
    serverQueries.updateTheme.run(server.banner_path, body.accent_color, id);
  }

  return c.json({ ok: true });
});

// Upload custom banner image
servers.post("/:id/banner", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get("banner");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "No banner file provided" }, 400);
  }

  // Validate size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: "File too large (max 5MB)" }, 400);
  }

  // Validate type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP" }, 400);
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const dataDir = process.env.DATA_DIR ?? "/data";
  const bannerDir = `${dataDir}/banners`;

  // Ensure directory exists
  const { mkdirSync } = await import("fs");
  mkdirSync(bannerDir, { recursive: true });

  const filename = `${id}.${ext}`;
  const filePath = `${bannerDir}/${filename}`;

  // Write file
  const buffer = await file.arrayBuffer();
  await Bun.write(filePath, buffer);

  // Update DB
  const bannerPath = `/api/servers/${id}/banner`;
  serverQueries.updateTheme.run(bannerPath, server.accent_color, id);

  return c.json({ ok: true, banner_path: bannerPath });
});

// Serve banner image
servers.get("/:id/banner", async (c) => {
  const { id } = c.req.param();
  const dataDir = process.env.DATA_DIR ?? "/data";
  const bannerDir = `${dataDir}/banners`;

  // Try each extension
  for (const ext of ["jpg", "png", "webp"]) {
    const filePath = `${bannerDir}/${id}.${ext}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      return new Response(file.stream(), {
        headers: {
          "Content-Type": mimeMap[ext],
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  return c.json({ error: "No banner found" }, 404);
});

// Delete custom banner (reset to default)
servers.delete("/:id/banner", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const dataDir = process.env.DATA_DIR ?? "/data";
  const bannerDir = `${dataDir}/banners`;
  const { unlinkSync } = await import("fs");

  // Remove any existing banner file
  for (const ext of ["jpg", "png", "webp"]) {
    try {
      unlinkSync(`${bannerDir}/${id}.${ext}`);
    } catch (_) {
      /* not found */
    }
  }

  // Clear from DB
  serverQueries.updateTheme.run(null, server.accent_color, id);

  return c.json({ ok: true });
});

// Session history for a server
servers.get("/:id/history", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const sessions = serverSessionQueries.history.all(id);
  const formatted = sessions.map((s) => ({
    id: s.id,
    started_at: s.started_at,
    stopped_at: s.stopped_at,
    duration_seconds: s.stopped_at ? s.stopped_at - s.started_at : null,
    stop_reason: s.stop_reason,
  }));

  return c.json(formatted);
});

// --- Backup routes ---

// List ALL backups across all servers
servers.get("/backups/all", requireAuth, (c) => {
  const backups = backupQueries.listAll.all();
  return c.json(backups);
});

// List backups for a server
servers.get("/:id/backups", requireAuth, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const backups = backupQueries.list.all(id);
  return c.json(backups);
});

// Create a backup
servers.post("/:id/backups", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  try {
    const record = await createBackup(id);
    return c.json(record);
  } catch (err) {
    console.error("Backup error:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Download a backup
servers.get("/:id/backups/:bid/download", requireAuth, (c) => {
  const { id, bid } = c.req.param();
  const backup = backupQueries.getById.get(Number(bid));
  if (!backup || backup.server_id !== id) {
    return c.json({ error: "Backup not found" }, 404);
  }

  const filePath = getBackupFilePath(backup);
  if (!existsSync(filePath)) {
    return c.json({ error: "Backup file not found on disk" }, 404);
  }

  const file = Bun.file(filePath);
  return new Response(file.stream(), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backup.filename}"`,
      "Content-Length": String(backup.size_bytes),
    },
  });
});

// Restore a backup
servers.post("/:id/backups/:bid/restore", requireAuth, async (c) => {
  const { id, bid } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  try {
    await restoreBackup(id, Number(bid));
    return c.json({ ok: true, message: "Backup restored" });
  } catch (err) {
    console.error("Restore error:", err);
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Delete a backup
servers.delete("/:id/backups/:bid", requireAuth, (c) => {
  const { id, bid } = c.req.param();
  const backup = backupQueries.getById.get(Number(bid));
  if (!backup || backup.server_id !== id) {
    return c.json({ error: "Backup not found" }, 404);
  }

  try {
    deleteBackupFile(Number(bid));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

export default servers;

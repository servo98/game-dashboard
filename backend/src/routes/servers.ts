import { Hono } from "hono";
import { serverQueries, serverSessionQueries } from "../db";
import {
  startGameContainer,
  stopGameContainer,
  getContainerStatus,
  getActiveContainer,
  streamContainerLogs,
  streamContainerStats,
  watchContainer,
  markIntentionalStop,
} from "../docker";
import { requireAuth } from "../middleware/auth";
import type { Session } from "../db";

const servers = new Hono<{ Variables: { session: Session } }>();

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
    }))
  );
  return c.json(result);
});

// Start a game server — auth required (dashboard) OR bot key
servers.post("/:id/start", async (c) => {
  const botKey = c.req.header("X-Bot-Api-Key");
  const isBotRequest = botKey && botKey === process.env.BOT_API_KEY;

  if (!isBotRequest) {
    const token =
      c.req.header("Authorization")?.replace("Bearer ", "") ??
      getCookie(c.req.raw, "session");
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
      serverSessionQueries.stop.run(
        Math.floor(Date.now() / 1000),
        "replaced",
        active.name
      );
    }

    await startGameContainer(server.id, server.docker_image, server.port, envVars, volumes);

    // Record new session
    serverSessionQueries.start.run(server.id, Math.floor(Date.now() / 1000));

    // Watch for unexpected stops (crashes)
    const serverName = server.name;
    const serverId = server.id;
    watchContainer(serverId, async () => {
      serverSessionQueries.stop.run(
        Math.floor(Date.now() / 1000),
        "crash",
        serverId
      );
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [
                {
                  title: "🔴 Servidor caído",
                  description: `El servidor **${serverName}** se ha detenido inesperadamente.`,
                  color: 15158332,
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
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
      c.req.header("Authorization")?.replace("Bearer ", "") ??
      getCookie(c.req.raw, "session");
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
    serverSessionQueries.stop.run(
      Math.floor(Date.now() / 1000),
      "user",
      active.name
    );
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
      } catch (err) {
        if (!abortController.signal.aborted) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify("[Log stream ended]")}\n\n`)
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
      } catch (err) {
        if (!abortController.signal.aborted) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stats stream ended" })}\n\n`)
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
  });
});

// Update editable config for a stopped server
servers.put("/:id/config", requireAuth, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const status = await getContainerStatus(id);
  if (status === "running") {
    return c.json({ error: "Cannot edit config while server is running" }, 400);
  }

  const body = await c.req.json<{
    docker_image: string;
    env_vars: Record<string, string>;
  }>();

  serverQueries.update.run(body.docker_image, JSON.stringify(body.env_vars), id);

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

function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

export default servers;

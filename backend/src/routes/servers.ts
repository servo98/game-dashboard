import { Hono } from "hono";
import { serverQueries } from "../db";
import {
  startGameContainer,
  stopGameContainer,
  getContainerStatus,
  getActiveContainer,
  streamContainerLogs,
} from "../docker";
import { requireAuth, requireBotKey } from "../middleware/auth";
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
  // Accept either session cookie or bot API key
  const botKey = c.req.header("X-Bot-Api-Key");
  const isBotRequest = botKey && botKey === process.env.BOT_API_KEY;

  if (!isBotRequest) {
    // Try session auth
    const token = c.req.header("Authorization")?.replace("Bearer ", "")
      ?? getCookie(c.req.raw, "session");
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
    await startGameContainer(server.id, server.docker_image, server.port, envVars, volumes);
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
    const token = c.req.header("Authorization")?.replace("Bearer ", "")
      ?? getCookie(c.req.raw, "session");
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
    await stopGameContainer(active.name);
    return c.json({ ok: true, message: `${active.name} stopped` });
  }

  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  try {
    await stopGameContainer(id);
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

  // Close stream when client disconnects
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

function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

export default servers;

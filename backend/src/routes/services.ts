import { Hono } from "hono";
import { docker, streamHostStats, streamServiceLogs, streamServiceStats } from "../docker";
import { requireAuth } from "../middleware/auth";

const services = new Hono();

const ALLOWED_SERVICES = ["backend", "bot", "dashboard", "nginx"] as const;
type ServiceName = (typeof ALLOWED_SERVICES)[number];

function isAllowed(name: string): name is ServiceName {
  return ALLOWED_SERVICES.includes(name as ServiceName);
}

function sseResponse(
  req: Request,
  generator: (signal: AbortSignal) => AsyncGenerator<unknown>,
): Response {
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const data of generator(abortController.signal)) {
          if (abortController.signal.aborted) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      } catch {
        // stream ended
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
}

// --- Static routes first ---

// Host stats SSE
services.get("/host/stats", requireAuth, async (c) => {
  return sseResponse(c.req.raw, (signal) => streamHostStats(signal));
});

// Multiplexed service stats SSE — streams all compose services in one connection
services.get("/stats", requireAuth, async (c) => {
  const abortController = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const signal = abortController.signal;

      const promises = ALLOWED_SERVICES.map(async (name) => {
        try {
          for await (const stats of streamServiceStats(name, signal)) {
            if (signal.aborted) break;
            const payload = { service: name, ...stats };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
        } catch {
          // service may not be running
        }
      });

      await Promise.allSettled(promises);
      if (!signal.aborted) controller.close();
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

// --- Parameterized routes ---

// Restart a compose service
services.post("/:name/restart", requireAuth, async (c) => {
  const { name } = c.req.param();

  if (!isAllowed(name)) {
    return c.json({ error: `Unknown service. Allowed: ${ALLOWED_SERVICES.join(", ")}` }, 400);
  }

  const projectName = process.env.COMPOSE_PROJECT_NAME ?? "game-panel";
  const containerName = `${projectName}-${name}-1`;

  try {
    const container = docker.getContainer(containerName);
    await container.restart({ t: 10 });
    return c.json({ ok: true, message: `${name} restarting` });
  } catch (err) {
    console.error(`Restart error for ${name}:`, err);
    return c.json({ error: `Failed to restart ${name}` }, 500);
  }
});

// Service logs SSE
services.get("/:name/logs", requireAuth, async (c) => {
  const { name } = c.req.param();
  if (!isAllowed(name)) {
    return c.json({ error: `Unknown service. Allowed: ${ALLOWED_SERVICES.join(", ")}` }, 400);
  }
  return sseResponse(c.req.raw, (signal) => streamServiceLogs(name, signal));
});

export default services;

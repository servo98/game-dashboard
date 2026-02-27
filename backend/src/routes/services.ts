import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { docker } from "../docker";

const services = new Hono();

const ALLOWED_SERVICES = ["backend", "bot"] as const;
type ServiceName = (typeof ALLOWED_SERVICES)[number];

services.post("/:name/restart", requireAuth, async (c) => {
  const { name } = c.req.param();

  if (!ALLOWED_SERVICES.includes(name as ServiceName)) {
    return c.json({ error: "Unknown service. Use 'backend' or 'bot'." }, 400);
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

export default services;

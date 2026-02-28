import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { panelSettingsQueries, getAllPanelSettings } from "../db";
import type { Session } from "../db";

const settings = new Hono<{ Variables: { session: Session } }>();

settings.get("/", requireAuth, (c) => {
  return c.json(getAllPanelSettings());
});

settings.put("/", requireAuth, async (c) => {
  const body = await c.req.json<Record<string, string | number>>();

  const allowedKeys = ["host_domain", "game_memory_limit_gb", "game_cpu_limit", "auto_stop_hours"];
  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.includes(key)) {
      panelSettingsQueries.set.run(key, String(value));
    }
  }

  return c.json({ ok: true });
});

export default settings;

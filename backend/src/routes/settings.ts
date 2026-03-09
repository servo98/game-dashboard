import { Hono } from "hono";
import type { Session } from "../db";
import { getAllPanelSettings, panelSettingsQueries } from "../db";
import { requireApproved, requireAuth, requireAuthOrBotKey } from "../middleware/auth";

const settings = new Hono<{ Variables: { session: Session } }>();

settings.get("/", requireAuthOrBotKey, (c) => {
  return c.json(getAllPanelSettings());
});

settings.put("/", requireAuth, requireApproved, async (c) => {
  const body = await c.req.json<Record<string, string | number>>();

  const allowedKeys = [
    "host_domain",
    "game_memory_limit_gb",
    "game_cpu_limit",
    "auto_stop_hours",
    "max_backups_per_server",
    "auto_backup_interval_hours",
  ];
  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.includes(key)) {
      panelSettingsQueries.set.run(key, String(value));
    }
  }

  return c.json({ ok: true });
});

export default settings;

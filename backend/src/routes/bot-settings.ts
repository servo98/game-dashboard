import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { botSettingsQueries } from "../db";

const botSettings = new Hono();

const BOT_COMMANDS = [
  { name: "start", description: "Start a game server" },
  { name: "stop", description: "Stop the active game server" },
  { name: "status", description: "Show the status of all game servers" },
];

botSettings.get("/settings", requireAuth, async (c) => {
  const row = botSettingsQueries.get.get("allowed_channel_id");
  return c.json({
    allowed_channel_id: row?.value ?? null,
    commands: BOT_COMMANDS,
  });
});

botSettings.put("/settings", requireAuth, async (c) => {
  const body = await c.req.json<{ allowed_channel_id: string | null }>();
  const channelId = body.allowed_channel_id?.trim() || null;

  if (channelId) {
    botSettingsQueries.set.run("allowed_channel_id", channelId);
  } else {
    botSettingsQueries.unset.run("allowed_channel_id");
  }

  return c.json({ ok: true });
});

export default botSettings;

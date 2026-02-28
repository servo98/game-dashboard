import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { botSettingsQueries } from "../db";

const botSettings = new Hono();

const BOT_COMMANDS = [
  { name: "start", description: "Start a game server" },
  { name: "stop", description: "Stop the active game server" },
  { name: "status", description: "Show the status of all game servers" },
];

const CHANNEL_KEYS = [
  "allowed_channel_id",
  "errors_channel_id",
  "crashes_channel_id",
  "logs_channel_id",
] as const;

botSettings.get("/settings", requireAuth, async (c) => {
  const settings: Record<string, string | null> = {};
  for (const key of CHANNEL_KEYS) {
    const row = botSettingsQueries.get.get(key);
    settings[key] = row?.value ?? null;
  }
  return c.json({
    ...settings,
    commands: BOT_COMMANDS,
  });
});

botSettings.put("/settings", requireAuth, async (c) => {
  const body = await c.req.json<Record<string, string | null>>();

  for (const key of CHANNEL_KEYS) {
    if (!(key in body)) continue;
    const value = typeof body[key] === "string" ? body[key]!.trim() : null;
    if (value) {
      botSettingsQueries.set.run(key, value);
    } else {
      botSettingsQueries.unset.run(key);
    }
  }

  return c.json({ ok: true });
});

// List text channels from Discord guild
botSettings.get("/channels", requireAuth, async (c) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    return c.json({ error: "DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not configured" }, 500);
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Discord channels fetch error:", err);
      return c.json({ error: "Failed to fetch channels from Discord" }, 502);
    }

    const channels = (await res.json()) as Array<{
      id: string;
      name: string;
      type: number;
      parent_id: string | null;
    }>;

    // Type 0 = text channel
    const textChannels = channels
      .filter((ch) => ch.type === 0)
      .map((ch) => ({ id: ch.id, name: ch.name, parent_id: ch.parent_id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json(textChannels);
  } catch (err) {
    console.error("Discord channels error:", err);
    return c.json({ error: "Failed to fetch channels" }, 500);
  }
});

export default botSettings;

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { botSettingsQueries } from "../db";

const notifications = new Hono();

notifications.post("/error", requireAuth, async (c) => {
  const body = await c.req.json<{
    message: string;
    stack?: string;
    url?: string;
    component?: string;
  }>();

  const channelRow = botSettingsQueries.get.get("errors_channel_id");
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!channelRow?.value || !botToken) {
    return c.json({ ok: true, sent: false });
  }

  const fields = [];
  if (body.url) fields.push({ name: "URL", value: body.url, inline: true });
  if (body.component) fields.push({ name: "Component", value: body.component, inline: true });
  if (body.stack) {
    fields.push({
      name: "Stack",
      value: "```\n" + body.stack.slice(0, 1000) + "\n```",
      inline: false,
    });
  }

  try {
    await fetch(`https://discord.com/api/v10/channels/${channelRow.value}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [
          {
            title: "🟠 Dashboard Error",
            description: body.message.slice(0, 2000),
            color: 16744192, // orange
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    return c.json({ ok: true, sent: true });
  } catch (err) {
    console.error("Failed to send error notification:", err);
    return c.json({ ok: true, sent: false });
  }
});

export default notifications;

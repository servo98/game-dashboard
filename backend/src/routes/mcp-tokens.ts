import { Hono } from "hono";
import { mcpTokenQueries, type Session } from "../db";
import { requireApproved, requireAuth } from "../middleware/auth";

const mcpTokens = new Hono();

/** Extract session set by requireAuth middleware */
function getSession(c: { get(key: string): unknown }): Session {
  return c.get("session") as Session;
}

/** List tokens belonging to the current user */
mcpTokens.get("/", requireAuth, requireApproved, (c) => {
  const session = getSession(c);
  const tokens = mcpTokenQueries.listByDiscordId.all(session.discord_id);

  // Never return the full token — only first 8 chars for identification
  return c.json(
    tokens.map((t) => ({
      id: t.id,
      token_preview: `${t.token.slice(0, 8)}...`,
      player_name: t.player_name,
      label: t.label,
      created_at: t.created_at,
      last_used_at: t.last_used_at,
    })),
  );
});

/** Generate a new MCP token */
mcpTokens.post("/", requireAuth, requireApproved, async (c) => {
  const session = getSession(c);
  const body = await c.req.json<{
    player_name: string;
    label?: string;
  }>();

  if (!body.player_name?.trim()) {
    return c.json({ error: "player_name is required" }, 400);
  }

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

  mcpTokenQueries.insert.run(
    token,
    session.discord_id,
    session.username,
    body.player_name.trim(),
    body.label?.trim() ?? "",
  );

  // Return the full token only once — client must copy it now
  return c.json({ token, player_name: body.player_name.trim() });
});

/** Revoke a token */
mcpTokens.delete("/:id", requireAuth, requireApproved, (c) => {
  const session = getSession(c);
  const id = Number(c.req.param("id"));

  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  mcpTokenQueries.deleteById.run(id, session.discord_id);
  return c.json({ ok: true });
});

export default mcpTokens;

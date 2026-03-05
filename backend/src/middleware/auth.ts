import type { Context, Next } from "hono";
import { panelUserQueries, sessionQueries } from "../db";

export async function requireAuth(c: Context, next: Next) {
  const token =
    c.req.header("Authorization")?.replace("Bearer ", "") ?? getCookie(c.req.raw, "session");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = sessionQueries.get.get(token);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("session", session);
  await next();
}

export async function requireApproved(c: Context, next: Next) {
  const session = c.get("session") as { discord_id: string } | undefined;
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let user = panelUserQueries.get.get(session.discord_id);

  // Fallback: if not in panel_users but IS in ALLOWED_DISCORD_IDS, auto-insert as approved
  if (!user) {
    const allowedIds = (process.env.ALLOWED_DISCORD_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowedIds.includes(session.discord_id)) {
      panelUserQueries.insert.run(session.discord_id, session.discord_id, null, "approved");
      user = panelUserQueries.get.get(session.discord_id);
    }
  }

  if (!user || user.status !== "approved") {
    return c.json({ error: "Access pending approval" }, 403);
  }

  await next();
}

export async function requireBotKey(c: Context, next: Next) {
  const key = c.req.header("X-Bot-Api-Key");
  if (!key || key !== process.env.BOT_API_KEY) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}

export function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

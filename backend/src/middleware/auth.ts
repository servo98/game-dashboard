import type { Context, Next } from "hono";
import { sessionQueries } from "../db";

export async function requireAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "")
    ?? getCookie(c.req.raw, "session");

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

export async function requireBotKey(c: Context, next: Next) {
  const key = c.req.header("X-Bot-Api-Key");
  if (!key || key !== process.env.BOT_API_KEY) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}

function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

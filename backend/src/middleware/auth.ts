import type { Context, Next } from "hono";
import { panelUserQueries, sessionQueries, userServerAccessQueries } from "../db";

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
  // Bot key requests are trusted — skip approval check
  if (c.get("isBotRequest")) {
    return next();
  }

  const session = c.get("session") as { discord_id: string } | undefined;
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let user = panelUserQueries.get.get(session.discord_id);

  // Fallback: if not in panel_users but IS in ALLOWED_DISCORD_IDS, auto-insert as approved admin
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

  c.set("role", user.role);
  c.set("discordId", session.discord_id);
  await next();
}

/** Only allow admin users (ALLOWED_DISCORD_IDS). Must be used after requireAuth + requireApproved. */
export async function requireAdmin(c: Context, next: Next) {
  // Bot key requests are trusted
  if (c.get("isBotRequest")) {
    return next();
  }

  const role = c.get("role") as string | undefined;
  if (role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}

/** Check if user has access to the specific server (by route param).
 *  Admins and bot requests bypass the check. Must be used after requireAuth + requireApproved. */
export function requireServerAccess(paramName = "id") {
  return async (c: Context, next: Next) => {
    // Bot requests bypass
    if (c.get("isBotRequest")) return next();

    const role = c.get("role") as string | undefined;
    // Admins have access to all servers
    if (role === "admin") return next();

    const discordId = c.get("discordId") as string;
    const serverId = c.req.param(paramName);
    if (!serverId) return c.json({ error: "Server ID required" }, 400);

    const access = userServerAccessQueries.get.get(discordId, serverId);
    if (!access) return c.json({ error: "No access to this server" }, 403);

    await next();
  };
}

export async function requireBotKey(c: Context, next: Next) {
  const key = c.req.header("X-Bot-Api-Key");
  if (!key || key !== process.env.BOT_API_KEY) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}

/** Allow either dashboard session OR bot API key.
 *  Bot key bypasses session check entirely (trusted service). */
export async function requireAuthOrBotKey(c: Context, next: Next) {
  const botKey = c.req.header("X-Bot-Api-Key");
  if (botKey && botKey === process.env.BOT_API_KEY) {
    c.set("isBotRequest", true);
    return next();
  }
  return requireAuth(c, next);
}

/** Check if user has one of the allowed invoice roles. Must be used after requireAuth + requireApproved. */
export function requireInvoiceRole(...allowed: string[]) {
  return async (c: Context, next: Next) => {
    if (c.get("isBotRequest")) return next();

    const discordId = c.get("discordId") as string;
    const user = panelUserQueries.get.get(discordId);
    if (!user?.invoice_role || !allowed.includes(user.invoice_role)) {
      return c.json({ error: "Invoice access required" }, 403);
    }
    c.set("invoiceRole", user.invoice_role);
    await next();
  };
}

export function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

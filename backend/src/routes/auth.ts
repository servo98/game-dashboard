import { Hono } from "hono";
import type { Session } from "../db";
import { sessionQueries } from "../db";
import { requireAuth } from "../middleware/auth";

const auth = new Hono<{ Variables: { session: Session } }>();

const DISCORD_API = "https://discord.com/api/v10";
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

auth.get("/discord", (c) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    response_type: "code",
    scope: "identify",
  });
  return c.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Missing code" }, 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    return c.json({ error: "Failed to exchange code" }, 400);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Get user info
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return c.json({ error: "Failed to fetch user" }, 400);
  }

  const user = (await userRes.json()) as {
    id: string;
    username: string;
    global_name?: string;
    avatar: string | null;
  };

  // Whitelist check
  const allowedIds = (process.env.ALLOWED_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedIds.length > 0 && !allowedIds.includes(user.id)) {
    return c.redirect(
      `${process.env.PUBLIC_URL ?? "http://localhost:5173"}/login?error=unauthorized`,
    );
  }

  // Create session
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

  sessionQueries.insert.run(
    token,
    user.id,
    user.global_name ?? user.username,
    user.avatar,
    expiresAt,
  );

  // Set cookie and redirect to dashboard
  const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:5173";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${publicUrl}/`,
      "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}`,
    },
  });
});

auth.get("/me", requireAuth, (c) => {
  const session = c.get("session");
  return c.json({
    discord_id: session.discord_id,
    username: session.username,
    avatar: session.avatar
      ? `https://cdn.discordapp.com/avatars/${session.discord_id}/${session.avatar}.png`
      : null,
  });
});

auth.post("/logout", requireAuth, (c) => {
  const token =
    c.req.header("Authorization")?.replace("Bearer ", "") ?? getCookie(c.req.raw, "session");
  if (token) {
    sessionQueries.delete.run(token);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0",
    },
  });
});

function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

export default auth;

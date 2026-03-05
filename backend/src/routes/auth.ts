import { Hono } from "hono";
import type { Session } from "../db";
import { panelUserQueries, sessionQueries } from "../db";
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

  const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:5173";
  const displayName = user.global_name ?? user.username;

  // Determine panel_users status
  const allowedIds = (process.env.ALLOWED_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let panelUser = panelUserQueries.get.get(user.id);
  let redirectPath = "/";

  if (!panelUser) {
    if (allowedIds.includes(user.id)) {
      // Whitelisted user, auto-approve
      panelUserQueries.insert.run(user.id, displayName, user.avatar, "approved");
    } else {
      // New user, pending approval
      panelUserQueries.insert.run(user.id, displayName, user.avatar, "pending");
      redirectPath = "/pending";
    }
    panelUser = panelUserQueries.get.get(user.id);
  } else {
    // Existing user — update profile
    panelUserQueries.updateProfile.run(displayName, user.avatar, user.id);

    if (panelUser.status === "rejected") {
      return c.redirect(`${publicUrl}/login?error=rejected`);
    }
    if (panelUser.status === "pending") {
      redirectPath = "/pending";
    }
    // approved → redirectPath stays "/"
  }

  // Create session
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

  sessionQueries.insert.run(token, user.id, displayName, user.avatar, expiresAt);

  // Check for pending OAuth authorization flow
  const oauthReturn = getCookie(c.req.raw, "oauth_return");
  if (oauthReturn) {
    const returnPath = decodeURIComponent(oauthReturn);
    if (returnPath.startsWith("/oauth/authorize")) {
      return new Response(null, {
        status: 302,
        headers: [
          ["Location", returnPath],
          [
            "Set-Cookie",
            `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}`,
          ],
          ["Set-Cookie", "oauth_return=; Path=/; HttpOnly; Max-Age=0"],
        ],
      });
    }
  }

  // Default: redirect based on status
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${publicUrl}${redirectPath}`,
      "Set-Cookie": `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}`,
    },
  });
});

auth.get("/me", requireAuth, (c) => {
  const session = c.get("session");
  const panelUser = panelUserQueries.get.get(session.discord_id);
  return c.json({
    discord_id: session.discord_id,
    username: session.username,
    avatar: session.avatar
      ? `https://cdn.discordapp.com/avatars/${session.discord_id}/${session.avatar}.png`
      : null,
    status: panelUser?.status ?? "pending",
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

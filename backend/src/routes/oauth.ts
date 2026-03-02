import { Hono } from "hono";
import { db, mcpTokenQueries, sessionQueries } from "../db";
import { getCookie } from "../middleware/auth";

// ─── Tables ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_clients (
    id TEXT PRIMARY KEY,
    secret TEXT NOT NULL,
    redirect_uris TEXT NOT NULL DEFAULT '[]',
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS oauth_codes (
    code TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT,
    code_challenge_method TEXT,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
`);

// ─── Types & Queries ────────────────────────────────────────────────────────

type OAuthClient = {
  id: string;
  secret: string;
  redirect_uris: string;
  name: string;
  created_at: number;
};

type OAuthCode = {
  code: string;
  client_id: string;
  discord_id: string;
  discord_username: string;
  redirect_uri: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  expires_at: number;
  used: number;
};

const oauthClientQueries = {
  getById: db.query<OAuthClient, [string]>("SELECT * FROM oauth_clients WHERE id = ?"),
  insert: db.query<void, [string, string, string, string]>(
    "INSERT INTO oauth_clients (id, secret, redirect_uris, name) VALUES (?, ?, ?, ?)",
  ),
};

export const oauthCodeQueries = {
  getByCode: db.query<OAuthCode, [string]>(
    "SELECT * FROM oauth_codes WHERE code = ? AND expires_at > unixepoch() AND used = 0",
  ),
  insert: db.query<
    void,
    [string, string, string, string, string, string | null, string | null, number]
  >(
    "INSERT INTO oauth_codes (code, client_id, discord_id, discord_username, redirect_uri, code_challenge, code_challenge_method, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  markUsed: db.query<void, [string]>("UPDATE oauth_codes SET used = 1 WHERE code = ?"),
  cleanup: db.query<void, []>(
    "DELETE FROM oauth_codes WHERE expires_at <= unixepoch() OR used = 1",
  ),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const oauth = new Hono();

// Dynamic Client Registration (RFC 7591) — required by MCP spec
oauth.post("/register", async (c) => {
  const body = (await c.req.json()) as {
    redirect_uris?: string[];
    client_name?: string;
  };
  const redirectUris: string[] = body.redirect_uris ?? [];
  const clientName = body.client_name ?? "";

  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomUUID();

  oauthClientQueries.insert.run(clientId, clientSecret, JSON.stringify(redirectUris), clientName);

  return c.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      client_name: clientName,
      token_endpoint_auth_method: "none",
    },
    201,
  );
});

// Authorization endpoint — GET shows consent page
oauth.get("/authorize", async (c) => {
  const clientId = c.req.query("client_id") ?? "";
  const redirectUri = c.req.query("redirect_uri") ?? "";
  const codeChallenge = c.req.query("code_challenge") ?? "";
  const codeChallengeMethod = c.req.query("code_challenge_method") ?? "";
  const responseType = c.req.query("response_type") ?? "";
  const state = c.req.query("state") ?? "";

  if (responseType !== "code") {
    return c.text("Unsupported response_type. Must be 'code'.", 400);
  }
  if (!clientId || !redirectUri) {
    return c.text("Missing required parameters: client_id, redirect_uri", 400);
  }

  const client = oauthClientQueries.getById.get(clientId);
  if (!client) {
    return c.text("Unknown client_id", 400);
  }

  const registeredUris = JSON.parse(client.redirect_uris) as string[];
  if (!registeredUris.includes(redirectUri)) {
    return c.text("Invalid redirect_uri", 400);
  }

  // Check if user has a dashboard session
  const sessionToken = getCookie(c.req.raw, "session");
  const session = sessionToken ? sessionQueries.get.get(sessionToken) : null;

  if (!session) {
    // Not logged in — save OAuth params and redirect to Discord login
    const returnParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      response_type: responseType,
      state,
    });
    const returnUrl = `/oauth/authorize?${returnParams.toString()}`;

    return new Response(null, {
      status: 302,
      headers: [
        ["Location", "/api/auth/discord"],
        [
          "Set-Cookie",
          `oauth_return=${encodeURIComponent(returnUrl)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
        ],
      ],
    });
  }

  // User is logged in — show consent page
  return c.html(
    renderConsentPage({
      username: session.username,
      clientName: client.name || "MCP Client",
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      state,
    }),
  );
});

// Authorization endpoint — POST processes consent
oauth.post("/authorize", async (c) => {
  const form = await c.req.formData();
  const action = form.get("action") as string;
  const clientId = form.get("client_id") as string;
  const redirectUri = form.get("redirect_uri") as string;
  const codeChallenge = (form.get("code_challenge") as string) || null;
  const codeChallengeMethod = (form.get("code_challenge_method") as string) || null;
  const state = form.get("state") as string;

  // Deny → redirect back with error
  if (action === "deny") {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return c.redirect(url.toString());
  }

  // Verify session
  const sessionToken = getCookie(c.req.raw, "session");
  const session = sessionToken ? sessionQueries.get.get(sessionToken) : null;
  if (!session) return c.text("Session expired. Please try again.", 401);

  // Verify client
  const client = oauthClientQueries.getById.get(clientId);
  if (!client) return c.text("Unknown client", 400);

  // Generate authorization code (5-minute expiry)
  const code = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 300;

  oauthCodeQueries.insert.run(
    code,
    clientId,
    session.discord_id,
    session.username,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    expiresAt,
  );

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return c.redirect(url.toString());
});

// Token endpoint — exchange auth code for access token
oauth.post("/token", async (c) => {
  let grantType: string;
  let code: string;
  let redirectUri: string;
  let clientId: string;
  let codeVerifier: string;

  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await c.req.json()) as Record<string, string>;
    grantType = body.grant_type ?? "";
    code = body.code ?? "";
    redirectUri = body.redirect_uri ?? "";
    clientId = body.client_id ?? "";
    codeVerifier = body.code_verifier ?? "";
  } else {
    const body = await c.req.parseBody();
    grantType = (body.grant_type as string) ?? "";
    code = (body.code as string) ?? "";
    redirectUri = (body.redirect_uri as string) ?? "";
    clientId = (body.client_id as string) ?? "";
    codeVerifier = (body.code_verifier as string) ?? "";
  }

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }
  if (!code || !clientId) {
    return c.json(
      { error: "invalid_request", error_description: "Missing code or client_id" },
      400,
    );
  }

  // Look up authorization code
  const authCode = oauthCodeQueries.getByCode.get(code);
  if (!authCode) {
    return c.json({ error: "invalid_grant", error_description: "Invalid or expired code" }, 400);
  }
  if (authCode.client_id !== clientId) {
    return c.json({ error: "invalid_grant", error_description: "Client mismatch" }, 400);
  }
  if (authCode.redirect_uri !== redirectUri) {
    return c.json({ error: "invalid_grant", error_description: "Redirect URI mismatch" }, 400);
  }

  // Verify PKCE
  if (authCode.code_challenge) {
    if (!codeVerifier) {
      return c.json({ error: "invalid_grant", error_description: "Missing code_verifier" }, 400);
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const base64url = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    if (base64url !== authCode.code_challenge) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }
  }

  // Mark code as used
  oauthCodeQueries.markUsed.run(code);

  // Create an MCP token for this user (reuse existing player_name if possible)
  const accessToken = `mcp_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const existingTokens = mcpTokenQueries.listByDiscordId.all(authCode.discord_id);
  const playerName = existingTokens[0]?.player_name ?? authCode.discord_username;

  mcpTokenQueries.insert.run(
    accessToken,
    authCode.discord_id,
    authCode.discord_username,
    playerName,
    "OAuth (auto-generated)",
  );

  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
  });
});

// ─── Well-known metadata ────────────────────────────────────────────────────

export function registerWellKnown(app: Hono) {
  app.get("/.well-known/oauth-authorization-server", (c) => {
    const base = getBaseUrl(c.req.raw);
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  app.get("/.well-known/oauth-protected-resource", (c) => {
    const base = getBaseUrl(c.req.raw);
    return c.json({
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
    });
  });
}

// ─── Consent page ───────────────────────────────────────────────────────────

function renderConsentPage(params: {
  username: string;
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — Game Panel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #111;
      border: 1px solid #333;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
    }
    .title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { color: #999; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    .info {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 24px;
      font-size: 14px;
      line-height: 1.6;
    }
    .info strong { color: #fff; }
    .scope-list { margin-top: 10px; padding-left: 4px; }
    .scope-item { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: #aaa; font-size: 13px; }
    .scope-check { color: #6366f1; }
    .buttons { display: flex; gap: 12px; }
    button {
      flex: 1;
      padding: 12px 16px;
      border-radius: 10px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .allow { background: #6366f1; color: white; }
    .allow:hover { background: #5558e6; }
    .deny { background: #222; color: #aaa; border: 1px solid #333; }
    .deny:hover { background: #2a2a2a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Authorize Access</div>
    <div class="subtitle">
      <strong>${escapeHtml(params.clientName)}</strong> wants to connect to your Game Panel.
    </div>
    <div class="info">
      Logged in as <strong>${escapeHtml(params.username)}</strong>
      <div class="scope-list">
        <div class="scope-item"><span class="scope-check">&#10003;</span> View server status and players</div>
        <div class="scope-item"><span class="scope-check">&#10003;</span> View quest progress and stats</div>
        <div class="scope-item"><span class="scope-check">&#10003;</span> Search recipes and mods</div>
      </div>
    </div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}">
      <input type="hidden" name="state" value="${escapeHtml(params.state)}">
      <div class="buttons">
        <button type="submit" name="action" value="deny" class="deny">Deny</button>
        <button type="submit" name="action" value="allow" class="allow">Allow</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

export default oauth;

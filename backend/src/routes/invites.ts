import { Hono } from "hono";
import type { Session } from "../db";
import { inviteLinkQueries, panelUserQueries, serverQueries, userServerAccessQueries } from "../db";
import { requireAdmin, requireApproved, requireAuth } from "../middleware/auth";

const invites = new Hono<{ Variables: { session: Session } }>();

// Create invite link (admin only)
invites.post("/", requireAuth, requireApproved, requireAdmin, async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    server_ids: string[];
    expires_in_hours?: number;
    max_uses?: number;
    label?: string;
  }>();

  if (!Array.isArray(body.server_ids) || body.server_ids.length === 0) {
    return c.json({ error: "At least one server_id is required" }, 400);
  }

  // Validate server IDs
  for (const sid of body.server_ids) {
    if (!serverQueries.getById.get(sid)) {
      return c.json({ error: `Server '${sid}' not found` }, 404);
    }
  }

  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const expiresAt = body.expires_in_hours
    ? Math.floor(Date.now() / 1000) + body.expires_in_hours * 3600
    : null;

  inviteLinkQueries.insert.run(
    code,
    JSON.stringify(body.server_ids),
    session.discord_id,
    expiresAt,
    body.max_uses ?? null,
    body.label ?? "",
  );

  const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:5173";
  return c.json({
    ok: true,
    code,
    url: `${publicUrl}/invite/${code}`,
  });
});

// List all invite links (admin only)
invites.get("/", requireAuth, requireApproved, requireAdmin, (c) => {
  const all = inviteLinkQueries.listAll.all();
  const now = Math.floor(Date.now() / 1000);

  return c.json(
    all.map((inv) => {
      const serverIds = JSON.parse(inv.server_ids) as string[];
      const servers = serverIds
        .map((sid) => serverQueries.getById.get(sid))
        .filter(Boolean)
        .map((s) => ({ id: s!.id, name: s!.name }));

      return {
        id: inv.id,
        code: inv.code,
        servers,
        label: inv.label,
        created_at: inv.created_at,
        expires_at: inv.expires_at,
        expired: inv.expires_at ? inv.expires_at < now : false,
        max_uses: inv.max_uses,
        use_count: inv.use_count,
      };
    }),
  );
});

// Delete invite link (admin only)
invites.delete("/:id", requireAuth, requireApproved, requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  const invite = inviteLinkQueries.getById.get(id);
  if (!invite) return c.json({ error: "Invite not found" }, 404);

  inviteLinkQueries.deleteById.run(id);
  return c.json({ ok: true });
});

// Get invite info (public — so the invite page can show server names before login)
invites.get("/:code/info", (c) => {
  const { code } = c.req.param();
  const invite = inviteLinkQueries.getByCode.get(code);
  if (!invite) return c.json({ error: "Invite not found" }, 404);

  const now = Math.floor(Date.now() / 1000);
  if (invite.expires_at && invite.expires_at < now) {
    return c.json({ error: "Invite has expired" }, 410);
  }
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    return c.json({ error: "Invite has reached its maximum uses" }, 410);
  }

  const serverIds = JSON.parse(invite.server_ids) as string[];
  const servers = serverIds
    .map((sid) => serverQueries.getById.get(sid))
    .filter(Boolean)
    .map((s) => ({ id: s!.id, name: s!.name, icon: s!.icon }));

  return c.json({
    code: invite.code,
    label: invite.label,
    servers,
    expires_at: invite.expires_at,
  });
});

// Accept invite (requires auth — user must be logged in)
invites.post("/:code/accept", requireAuth, async (c) => {
  const session = c.get("session") as Session;
  const { code } = c.req.param();

  const invite = inviteLinkQueries.getByCode.get(code);
  if (!invite) return c.json({ error: "Invite not found" }, 404);

  const now = Math.floor(Date.now() / 1000);
  if (invite.expires_at && invite.expires_at < now) {
    return c.json({ error: "Invite has expired" }, 410);
  }
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    return c.json({ error: "Invite has reached its maximum uses" }, 410);
  }

  // Check if user is already an admin — don't need invite
  const existingUser = panelUserQueries.get.get(session.discord_id);
  if (existingUser?.role === "admin") {
    return c.json({ ok: true, message: "You are already an admin" });
  }

  // Insert or update panel_users to approved
  if (!existingUser) {
    panelUserQueries.insert.run(session.discord_id, session.username, session.avatar, "approved");
    panelUserQueries.updateStatus.run("approved", now, invite.created_by, session.discord_id);
  } else if (existingUser.status !== "approved") {
    panelUserQueries.updateStatus.run("approved", now, invite.created_by, session.discord_id);
  }

  // Grant server access
  const serverIds = JSON.parse(invite.server_ids) as string[];
  for (const sid of serverIds) {
    userServerAccessQueries.insert.run(session.discord_id, sid, invite.created_by);
  }

  // Increment use count
  inviteLinkQueries.incrementUse.run(code);

  return c.json({ ok: true });
});

export default invites;

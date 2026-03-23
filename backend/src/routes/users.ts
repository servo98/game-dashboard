import { Hono } from "hono";
import type { Session } from "../db";
import { panelUserQueries, serverQueries, userServerAccessQueries } from "../db";
import { requireAdmin, requireApproved, requireAuth } from "../middleware/auth";

const users = new Hono<{ Variables: { session: Session } }>();

// All user management is admin-only

// List all panel users (with their server access)
users.get("/", requireAuth, requireApproved, requireAdmin, (c) => {
  const all = panelUserQueries.getAll.all();
  const result = all.map((u) => {
    const access = userServerAccessQueries.listByUser.all(u.discord_id);
    return {
      ...u,
      server_access: access.map((a) => a.server_id),
    };
  });
  return c.json(result);
});

// Approve a pending user
users.put("/:id/approve", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const session = c.get("session");

  if (id === session.discord_id) {
    return c.json({ error: "Cannot modify your own status" }, 400);
  }

  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  panelUserQueries.updateStatus.run(
    "approved",
    Math.floor(Date.now() / 1000),
    session.discord_id,
    id,
  );
  return c.json({ ok: true });
});

// Reject a user
users.put("/:id/reject", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const session = c.get("session");

  if (id === session.discord_id) {
    return c.json({ error: "Cannot modify your own status" }, 400);
  }

  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  panelUserQueries.updateStatus.run("rejected", null, session.discord_id, id);
  return c.json({ ok: true });
});

// Delete a user (also removes their server access)
users.delete("/:id", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const session = c.get("session");

  if (id === session.discord_id) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  userServerAccessQueries.deleteByUser.run(id);
  panelUserQueries.delete.run(id);
  return c.json({ ok: true });
});

// Get server access for a user
users.get("/:id/servers", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  const access = userServerAccessQueries.listByUser.all(id);
  return c.json(access.map((a) => a.server_id));
});

// Set server access for a user (replaces existing)
users.put("/:id/servers", requireAuth, requireApproved, requireAdmin, async (c) => {
  const { id } = c.req.param();
  const session = c.get("session");
  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  if (user.role === "admin") {
    return c.json({ error: "Admins have access to all servers" }, 400);
  }

  const body = await c.req.json<{ server_ids: string[] }>();
  if (!Array.isArray(body.server_ids)) {
    return c.json({ error: "server_ids must be an array" }, 400);
  }

  // Validate server IDs exist
  for (const sid of body.server_ids) {
    if (!serverQueries.getById.get(sid)) {
      return c.json({ error: `Server '${sid}' not found` }, 404);
    }
  }

  // Replace: delete all then re-insert
  userServerAccessQueries.deleteByUser.run(id);
  for (const sid of body.server_ids) {
    userServerAccessQueries.insert.run(id, sid, session.discord_id);
  }

  return c.json({ ok: true });
});

export default users;

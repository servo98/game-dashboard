import { Hono } from "hono";
import type { Session } from "../db";
import { panelUserQueries } from "../db";
import { requireApproved, requireAuth } from "../middleware/auth";

const users = new Hono<{ Variables: { session: Session } }>();

// List all panel users
users.get("/", requireAuth, requireApproved, (c) => {
  const all = panelUserQueries.getAll.all();
  return c.json(all);
});

// Approve a pending user
users.put("/:id/approve", requireAuth, requireApproved, (c) => {
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
users.put("/:id/reject", requireAuth, requireApproved, (c) => {
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

// Delete a user
users.delete("/:id", requireAuth, requireApproved, (c) => {
  const { id } = c.req.param();
  const session = c.get("session");

  if (id === session.discord_id) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  const user = panelUserQueries.get.get(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  panelUserQueries.delete.run(id);
  return c.json({ ok: true });
});

export default users;

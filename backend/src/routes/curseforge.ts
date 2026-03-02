import { Hono } from "hono";
import type { Session } from "../db";
import { requireAuth } from "../middleware/auth";

const curseforge = new Hono<{ Variables: { session: Session } }>();

curseforge.get("/search", requireAuth, async (c) => {
  const apiKey = process.env.CF_API_KEY;
  if (!apiKey) {
    return c.json({ error: "CurseForge API key not configured" }, 501);
  }

  const query = c.req.query("q")?.trim();
  if (!query) {
    return c.json({ error: "Missing search query" }, 400);
  }

  const url = new URL("https://api.curseforge.com/v1/mods/search");
  url.searchParams.set("gameId", "432");
  url.searchParams.set("classId", "4471");
  url.searchParams.set("searchFilter", query);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("sortField", "2");
  url.searchParams.set("sortOrder", "desc");

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    console.error("CurseForge API error:", res.status, await res.text());
    return c.json({ error: "CurseForge API request failed" }, 502);
  }

  const body = (await res.json()) as {
    data: Array<{
      id: number;
      name: string;
      slug: string;
      summary: string;
      downloadCount: number;
      logo?: { thumbnailUrl?: string } | null;
    }>;
  };

  const results = body.data.map((mod) => ({
    id: mod.id,
    name: mod.name,
    slug: mod.slug,
    summary: mod.summary,
    downloadCount: mod.downloadCount,
    thumbnailUrl: mod.logo?.thumbnailUrl ?? null,
  }));

  return c.json(results);
});

export default curseforge;

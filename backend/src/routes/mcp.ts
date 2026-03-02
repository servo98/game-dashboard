import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { createMinecraftAdapter } from "../adapters/minecraft/index";
import { type McpToken, mcpTokenQueries, serverQueries, sessionQueries } from "../db";
import { getActiveContainer } from "../docker";

const mcpRoute = new Hono();

/** Helper to create a text content response (satisfies MCP SDK literal types) */
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function noServer() {
  return textResult("No game server is currently running.");
}

/** Resolve the MCP token from Bearer auth and return the McpToken record */
function getMcpToken(req: Request): McpToken | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const record = mcpTokenQueries.getByToken.get(token);
  if (record) {
    mcpTokenQueries.updateLastUsed.run(record.id);
  }
  return record ?? null;
}

/** Check if the requesting user is a dashboard admin (has a valid session) */
function isAdmin(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const session = sessionQueries.get.get(token);
  return session !== null && session !== undefined;
}

async function getActiveMinecraftAdapter() {
  const active = await getActiveContainer();
  if (!active) return null;
  return createMinecraftAdapter(active.name);
}

function createMcpServer(mcpToken: McpToken | null, adminMode: boolean) {
  const server = new McpServer({
    name: "Game Panel",
    version: "1.0.0",
  });

  const playerName = mcpToken?.player_name ?? "unknown";

  // ─── Tools ──────────────────────────────────────────────────────────────

  server.tool(
    "server_status",
    "Get the current game server status, players online, and uptime",
    {},
    async () => {
      const active = await getActiveContainer();
      if (!active) return noServer();

      const serverRecord = serverQueries.getById.get(active.name);
      const adapter = await createMinecraftAdapter(active.name);
      let playerList: string[] = [];

      if (adapter) {
        try {
          const result = await adapter.runCommand("list");
          playerList = result
            .replace(/^.*:\s*/, "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
        } catch {
          // RCON may not be ready
        }
      }

      return textResult(
        JSON.stringify(
          {
            serverId: active.name,
            serverName: serverRecord?.name ?? active.name,
            gameType: serverRecord?.game_type ?? "unknown",
            status: "running",
            playersOnline: playerList,
            detectedSystems: adapter?.detectedSystems ?? [],
          },
          null,
          2,
        ),
      );
    },
  );

  server.tool(
    "list_quests",
    "List all quest chapters and their quests from the modpack",
    { chapter: z.string().optional().describe("Filter by chapter title (partial match)") },
    async ({ chapter }) => {
      const adapter = await getActiveMinecraftAdapter();
      if (!adapter) return noServer();

      const chapters = await adapter.getChapters();
      if (chapters.length === 0) return textResult("No quest system detected in this modpack.");

      let filtered = chapters;
      if (chapter) {
        const lower = chapter.toLowerCase();
        filtered = chapters.filter((c) => c.title.toLowerCase().includes(lower));
      }

      const result = filtered.map((ch) => ({
        chapter: ch.title,
        icon: ch.icon,
        quests: ch.quests.map((q) => ({
          id: q.id,
          title: q.title,
          tasks: q.tasks.length,
          dependencies: q.dependencies.length,
        })),
      }));

      return textResult(JSON.stringify(result, null, 2));
    },
  );

  server.tool(
    "get_quest_progress",
    "Get quest completion progress for a player",
    { player_name: z.string().optional().describe("Player name (defaults to your linked player)") },
    async ({ player_name }) => {
      const adapter = await getActiveMinecraftAdapter();
      if (!adapter) return noServer();

      const name = player_name ?? playerName;
      const progress = await adapter.getQuestProgress(name);

      if (!progress) return textResult(`No quest progress found for player "${name}".`);

      return textResult(
        JSON.stringify(
          {
            player: progress.playerName,
            completedCount: progress.completed.length,
            startedCount: progress.started.length,
            completed: progress.completed,
            started: progress.started,
          },
          null,
          2,
        ),
      );
    },
  );

  server.tool(
    "suggest_next",
    "Suggest quests whose dependencies are already completed",
    { player_name: z.string().optional().describe("Player name (defaults to your linked player)") },
    async ({ player_name }) => {
      const adapter = await getActiveMinecraftAdapter();
      if (!adapter) return noServer();

      const name = player_name ?? playerName;
      const [chapters, progress] = await Promise.all([
        adapter.getChapters(),
        adapter.getQuestProgress(name),
      ]);

      if (!progress) return textResult(`No quest progress found for "${name}".`);

      const completedSet = new Set(progress.completed);
      const suggestions: { chapter: string; quest: string; id: string }[] = [];

      for (const chapter of chapters) {
        for (const quest of chapter.quests) {
          if (completedSet.has(quest.id)) continue;
          if (quest.dependencies.every((d) => completedSet.has(d))) {
            suggestions.push({
              chapter: chapter.title,
              quest: quest.title,
              id: quest.id,
            });
          }
        }
      }

      if (suggestions.length === 0) {
        return textResult(
          "No available quests found. All dependencies may not be met or all quests are completed.",
        );
      }

      return textResult(JSON.stringify(suggestions, null, 2));
    },
  );

  server.tool(
    "search_recipes",
    "Search KubeJS/CraftTweaker scripts for a specific item or recipe",
    {
      item_name: z
        .string()
        .describe("Item name or ID to search for (e.g. 'diamond', 'minecraft:iron_ingot')"),
    },
    async ({ item_name }) => {
      const adapter = await getActiveMinecraftAdapter();
      if (!adapter) return noServer();

      const scripts = await adapter.getRecipeScripts();
      if (scripts.length === 0)
        return textResult("No recipe scripts found (KubeJS/CraftTweaker not detected).");

      const lower = item_name.toLowerCase();
      const matches = scripts
        .filter((s) => s.content.toLowerCase().includes(lower))
        .map((s) => ({
          path: s.path,
          relevantLines: s.content
            .split("\n")
            .filter((line) => line.toLowerCase().includes(lower))
            .slice(0, 20),
        }));

      if (matches.length === 0) return textResult(`No recipe scripts mention "${item_name}".`);

      return textResult(JSON.stringify(matches, null, 2));
    },
  );

  server.tool(
    "player_stats",
    "Get Minecraft statistics for a player (mobs killed, blocks mined, etc.)",
    { player_name: z.string().optional().describe("Player name (defaults to your linked player)") },
    async ({ player_name }) => {
      const adapter = await getActiveMinecraftAdapter();
      if (!adapter) return noServer();

      const name = player_name ?? playerName;
      const stats = await adapter.getPlayerStats(name);

      if (!stats || Object.keys(stats).length === 0) {
        return textResult(`No statistics found for player "${name}".`);
      }

      return textResult(JSON.stringify(stats, null, 2));
    },
  );

  server.tool("list_mods", "List all mods installed in the current modpack", {}, async () => {
    const adapter = await getActiveMinecraftAdapter();
    if (!adapter) return noServer();

    const mods = await adapter.getModList();
    if (mods.length === 0) return textResult("No mods directory found.");

    return textResult(`${mods.length} mods installed:\n\n${mods.join("\n")}`);
  });

  // Admin-only: run RCON command
  if (adminMode) {
    server.tool(
      "run_command",
      "Execute a server command via RCON (admin only)",
      { command: z.string().describe("The command to run (e.g. 'list', 'time set day')") },
      async ({ command }) => {
        const adapter = await getActiveMinecraftAdapter();
        if (!adapter) return noServer();

        try {
          const result = await adapter.runCommand(command);
          return textResult(result || "(no output)");
        } catch (err) {
          return textResult(`Command failed: ${(err as Error).message}`);
        }
      },
    );
  }

  // ─── Resources ──────────────────────────────────────────────────────────

  server.resource("modpack-scripts", "modpack://scripts", async (uri) => {
    const adapter = await getActiveMinecraftAdapter();
    if (!adapter) {
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain" as const, text: "No server running." }],
      };
    }

    const scripts = await adapter.getRecipeScripts();
    const text = scripts.map((s) => `=== ${s.path} ===\n${s.content}`).join("\n\n");

    return {
      contents: [
        { uri: uri.href, mimeType: "text/plain" as const, text: text || "No scripts found." },
      ],
    };
  });

  server.resource("modpack-info", "modpack://info", async (uri) => {
    const adapter = await getActiveMinecraftAdapter();
    if (!adapter) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json" as const,
            text: JSON.stringify({ error: "No server running" }),
          },
        ],
      };
    }

    const [mods, info] = await Promise.all([adapter.getModList(), adapter.getServerInfo()]);

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json" as const,
          text: JSON.stringify({ ...info, modCount: mods.length, mods }, null, 2),
        },
      ],
    };
  });

  // ─── Prompts ──────────────────────────────────────────────────────────

  server.prompt(
    "quest-guide",
    "Get a personalized quest guide with your progress and available quests",
    { player_name: z.string().optional().describe("Player name (defaults to your linked player)") },
    async ({ player_name }) => {
      const name = player_name ?? playerName;
      const adapter = await getActiveMinecraftAdapter();

      let questInfo = "No quest system detected.";
      if (adapter) {
        const [chapters, progress] = await Promise.all([
          adapter.getChapters(),
          adapter.getQuestProgress(name),
        ]);

        if (chapters.length > 0) {
          const completedSet = new Set(progress?.completed ?? []);
          const available: string[] = [];

          for (const ch of chapters) {
            for (const q of ch.quests) {
              if (!completedSet.has(q.id) && q.dependencies.every((d) => completedSet.has(d))) {
                available.push(`- [${ch.title}] ${q.title}`);
              }
            }
          }

          questInfo = [
            `Player: ${name}`,
            `Completed: ${progress?.completed.length ?? 0} quests`,
            `Started: ${progress?.started.length ?? 0} quests`,
            `\nAvailable quests (dependencies met):`,
            ...available.slice(0, 30),
            available.length > 30 ? `... and ${available.length - 30} more` : "",
          ].join("\n");
        }
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Here's the quest progress for this modpack. Help me decide what to do next and give tips for completing the available quests.\n\n${questInfo}`,
            },
          },
        ],
      };
    },
  );

  server.prompt(
    "recipe-help",
    "Get help finding or understanding recipes from the modpack's scripts",
    { item: z.string().describe("The item you need help crafting") },
    async ({ item }) => {
      const adapter = await getActiveMinecraftAdapter();
      let scriptContext = "No recipe scripts available.";

      if (adapter) {
        const scripts = await adapter.getRecipeScripts();
        const lower = item.toLowerCase();
        const relevant = scripts.filter((s) => s.content.toLowerCase().includes(lower));

        if (relevant.length > 0) {
          scriptContext = relevant.map((s) => `=== ${s.path} ===\n${s.content}`).join("\n\n");
        } else {
          scriptContext = `No scripts mention "${item}". The item may use vanilla crafting or a mod's built-in recipes.`;
        }
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I need help finding how to craft "${item}" in this modpack. Here are the relevant recipe scripts:\n\n${scriptContext}\n\nBased on these scripts, explain how to craft this item. If the scripts modify the vanilla recipe, explain what changed.`,
            },
          },
        ],
      };
    },
  );

  return server;
}

// ─── HTTP Handler ──────────────────────────────────────────────────────────

/** Allowed origins for MCP requests (DNS rebinding protection per MCP spec) */
const ALLOWED_ORIGINS = new Set([
  "https://game.aypapol.com",
  "https://claude.ai",
  "https://api.anthropic.com",
]);

mcpRoute.post("/mcp", async (c) => {
  // Origin validation per MCP spec security requirements
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return c.json({ error: "Forbidden origin" }, 403);
  }

  const mcpToken = getMcpToken(c.req.raw);
  const admin = isAdmin(c.req.raw);

  if (!mcpToken && !admin) {
    const proto = c.req.header("x-forwarded-proto") ?? "http";
    const host = c.req.header("host") ?? "localhost:3000";
    const resourceMetadata = `${proto}://${host}/.well-known/oauth-protected-resource`;
    return c.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
        },
      },
    );
  }

  const server = createMcpServer(mcpToken, admin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);

  return transport.handleRequest(c.req.raw);
});

mcpRoute.get("/mcp", async (c) => {
  return c.json(
    { error: "SSE transport not supported. Use POST /api/mcp for Streamable HTTP." },
    405,
  );
});

mcpRoute.delete("/mcp", async (c) => {
  return c.json({ ok: true }, 200);
});

export default mcpRoute;

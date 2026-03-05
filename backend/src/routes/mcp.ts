import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import type { GameAdapter } from "../adapters/adapter";
import { createMinecraftAdapter } from "../adapters/minecraft/index";
import { sanitize } from "../adapters/minecraft/sanitize";
import { type McpToken, mcpTokenQueries, serverQueries, sessionQueries } from "../db";
import { getActiveContainer, getContainerStatus } from "../docker";

const mcpRoute = new Hono();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

function successResult(data: unknown) {
  return jsonResult({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

function errorResult(error: string) {
  return jsonResult({
    success: false,
    error,
    timestamp: new Date().toISOString(),
  });
}

function noServer() {
  return errorResult("No game server is currently running.");
}

function noServerData(serverId: string) {
  return errorResult(
    `Could not resolve data path for server "${serverId}". Check that the server is configured with a /data volume.`,
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

function isAdmin(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const session = sessionQueries.get.get(token);
  return session !== null && session !== undefined;
}

// ─── Adapter resolution ───────────────────────────────────────────────────────

/**
 * Resolve adapter for a given server_id, or the active server if not specified.
 * Returns [adapter, serverId, isRunning] or null if no server found.
 */
async function resolveAdapter(
  serverId?: string,
): Promise<{ adapter: GameAdapter; serverId: string; isRunning: boolean } | null> {
  if (serverId) {
    // Specific server requested — works even if stopped
    const adapter = await createMinecraftAdapter(serverId);
    if (!adapter) return null;
    const status = await getContainerStatus(serverId);
    return { adapter, serverId, isRunning: status === "running" };
  }

  // Default: active (running) server
  const active = await getActiveContainer();
  if (!active) return null;
  const adapter = await createMinecraftAdapter(active.name);
  if (!adapter) return null;
  return { adapter, serverId: active.name, isRunning: true };
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

function createMcpServer(mcpToken: McpToken | null, adminMode: boolean) {
  const server = new McpServer({
    name: "Game Panel",
    version: "2.0.0",
  });

  const playerName = mcpToken?.player_name ?? "unknown";

  // Common schema for server_id parameter
  const serverIdParam = {
    server_id: z
      .string()
      .optional()
      .describe("Server ID to query (e.g. 'minecraft'). Defaults to the currently running server."),
  };

  // ─── Tools ──────────────────────────────────────────────────────────────

  server.tool(
    "list_servers",
    "List all configured game servers and their current status",
    {},
    async () => {
      const servers = serverQueries.getAll.all();
      const active = await getActiveContainer();

      const result = await Promise.all(
        servers
          .filter((s) => s.game_type === "minecraft")
          .map(async (s) => {
            const status = await getContainerStatus(s.id);
            const adapter = await createMinecraftAdapter(s.id);
            return {
              id: s.id,
              name: s.name,
              game_type: s.game_type,
              status,
              is_active: active?.name === s.id,
              detected_systems: adapter?.detectedSystems ?? [],
              port: s.port,
            };
          }),
      );

      return successResult(result);
    },
  );

  server.tool(
    "server_status",
    "Get the current game server status, players online, and uptime",
    { ...serverIdParam },
    async ({ server_id }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const { adapter, serverId: sid, isRunning } = resolved;
      const serverRecord = serverQueries.getById.get(sid);
      let playerList: string[] = [];

      if (isRunning) {
        try {
          const result = await adapter.runCommand!("list");
          playerList = result
            .replace(/^.*:\s*/, "")
            .split(",")
            .map((p) => sanitize(p))
            .filter(Boolean);
        } catch {
          // RCON may not be ready
        }
      }

      return successResult({
        serverId: sid,
        serverName: serverRecord?.name ?? sid,
        gameType: serverRecord?.game_type ?? "unknown",
        status: isRunning ? "running" : "stopped",
        playersOnline: playerList,
        detectedSystems: adapter.detectedSystems,
      });
    },
  );

  server.tool(
    "list_quests",
    "List all quest chapters and their quests from the modpack",
    {
      ...serverIdParam,
      chapter: z.string().optional().describe("Filter by chapter title (partial match)"),
    },
    async ({ server_id, chapter }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const chapters = await resolved.adapter.getChapters!();
      if (chapters.length === 0) return errorResult("No quest system detected in this modpack.");

      let filtered = chapters;
      if (chapter) {
        const lower = chapter.toLowerCase();
        filtered = chapters.filter((c) => c.title.toLowerCase().includes(lower));
      }

      const result = filtered.map((ch) => ({
        chapter: ch.title,
        icon: ch.icon,
        quest_count: ch.quests.length,
        quests: ch.quests.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description || undefined,
          tasks: q.tasks.length,
          dependencies: q.dependencies.length,
        })),
      }));

      return successResult(result);
    },
  );

  server.tool(
    "get_quest_details",
    "Get detailed information about a specific quest by its ID",
    {
      ...serverIdParam,
      quest_id: z.string().describe("The quest ID (hex string, e.g. '5151CDD8FCDE7A07')"),
    },
    async ({ server_id, quest_id }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const details = await resolved.adapter.getQuestDetails!(quest_id);
      if (!details) return errorResult(`Quest "${quest_id}" not found.`);

      return successResult(details);
    },
  );

  server.tool(
    "get_quest_progress",
    "Get quest completion progress for a player",
    {
      ...serverIdParam,
      player_name: z.string().optional().describe("Player name (defaults to your linked player)"),
    },
    async ({ server_id, player_name }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const name = player_name ?? playerName;
      const progress = await resolved.adapter.getQuestProgress!(name);

      if (!progress) return errorResult(`No quest progress found for player "${name}".`);

      // Enrich with quest titles
      const chapters = await resolved.adapter.getChapters!();
      const titleMap = new Map<string, { title: string; chapter: string }>();
      for (const ch of chapters) {
        for (const q of ch.quests) {
          titleMap.set(q.id, { title: q.title, chapter: ch.title });
        }
      }

      // Filter to only known quest IDs (progress maps also contain task/chapter IDs)
      const completedQuests = progress.completed
        .filter((id) => titleMap.has(id))
        .map((id) => ({ id, ...titleMap.get(id)! }));
      const startedQuests = progress.started
        .filter((id) => titleMap.has(id))
        .map((id) => ({ id, ...titleMap.get(id)! }));

      return successResult({
        player: progress.playerName,
        completedCount: completedQuests.length,
        startedCount: startedQuests.length,
        completed: completedQuests,
        started: startedQuests,
      });
    },
  );

  server.tool(
    "suggest_next",
    "Suggest quests whose dependencies are already completed",
    {
      ...serverIdParam,
      player_name: z.string().optional().describe("Player name (defaults to your linked player)"),
      chapter: z.string().optional().describe("Filter suggestions by chapter (partial match)"),
      limit: z.number().optional().describe("Max suggestions to return (default 10)"),
    },
    async ({ server_id, player_name, chapter, limit }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const name = player_name ?? playerName;
      const maxResults = limit ?? 10;

      const [chapters, progress] = await Promise.all([
        resolved.adapter.getChapters!(),
        resolved.adapter.getQuestProgress!(name),
      ]);

      if (!progress) return errorResult(`No quest progress found for "${name}".`);

      const completedSet = new Set(progress.completed);
      const suggestions: {
        chapter: string;
        quest_id: string;
        title: string;
        description: string;
        tasks: number;
        dependencies_met: number;
        total_dependencies: number;
      }[] = [];

      for (const ch of chapters) {
        if (chapter && !ch.title.toLowerCase().includes(chapter.toLowerCase())) continue;

        for (const quest of ch.quests) {
          if (completedSet.has(quest.id)) continue;
          if (quest.dependencies.every((d) => completedSet.has(d))) {
            suggestions.push({
              chapter: ch.title,
              quest_id: quest.id,
              title: quest.title,
              description: quest.description || "",
              tasks: quest.tasks.length,
              dependencies_met: quest.dependencies.length,
              total_dependencies: quest.dependencies.length,
            });
          }
        }
      }

      if (suggestions.length === 0) {
        return successResult({
          player: name,
          message:
            "No available quests found. All dependencies may not be met or all quests are completed.",
          suggestions: [],
        });
      }

      return successResult({
        player: name,
        total_available: suggestions.length,
        showing: Math.min(maxResults, suggestions.length),
        suggestions: suggestions.slice(0, maxResults),
      });
    },
  );

  server.tool(
    "search_recipes",
    "Search KubeJS/CraftTweaker scripts for a specific item or recipe",
    {
      ...serverIdParam,
      item_name: z
        .string()
        .describe("Item name or ID to search for (e.g. 'diamond', 'minecraft:iron_ingot')"),
    },
    async ({ server_id, item_name }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const result = await resolved.adapter.searchRecipes!(item_name);

      if (result.structured.length === 0 && result.rawMatches.length === 0) {
        return errorResult(
          `No recipe scripts mention "${item_name}". The item may use vanilla crafting or a mod's built-in recipes.`,
        );
      }

      return successResult({
        item: item_name,
        structured_recipes: result.structured,
        raw_matches:
          result.rawMatches.length > 0
            ? result.rawMatches.map((m) => ({
                path: m.path,
                relevant_lines: m.lines,
              }))
            : undefined,
        total_found: result.structured.length + result.rawMatches.length,
      });
    },
  );

  server.tool(
    "player_stats",
    "Get Minecraft statistics for a player (mobs killed, blocks mined, etc.) in readable format",
    {
      ...serverIdParam,
      player_name: z.string().optional().describe("Player name (defaults to your linked player)"),
    },
    async ({ server_id, player_name }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const name = player_name ?? playerName;
      const formatted = await resolved.adapter.getFormattedStats!(name);

      if (!formatted) {
        return errorResult(`No statistics found for player "${name}".`);
      }

      return successResult({
        player: name,
        movement: formatted.movement,
        time: formatted.time,
        combat: formatted.combat,
        mining: formatted.mining,
        crafting: formatted.crafting,
        interactions: formatted.interactions,
        raw: formatted.raw,
      });
    },
  );

  server.tool(
    "list_players",
    "List all players who have joined the server with play time and UUID",
    {
      ...serverIdParam,
    },
    async ({ server_id }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const players = await resolved.adapter.listPlayersExtended!();

      // If server is running, check who's online
      let onlinePlayers = new Set<string>();
      if (resolved.isRunning) {
        try {
          const result = await resolved.adapter.runCommand!("list");
          onlinePlayers = new Set(
            result
              .replace(/^.*:\s*/, "")
              .split(",")
              .map((p) => sanitize(p).toLowerCase())
              .filter(Boolean),
          );
        } catch {
          // RCON may not be ready
        }
      }

      return successResult({
        server_id: resolved.serverId,
        server_running: resolved.isRunning,
        total_players: players.length,
        players: players.map((p) => ({
          ...p,
          online: onlinePlayers.has(p.name.toLowerCase()),
        })),
      });
    },
  );

  server.tool(
    "leaderboard",
    "Get player rankings comparing stats across all players",
    {
      ...serverIdParam,
      category: z
        .enum(["general", "combat", "mining", "exploration", "farming"])
        .optional()
        .describe("Stat category (default: general)"),
      limit: z.number().optional().describe("Max players to show (default 10)"),
    },
    async ({ server_id, category, limit }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const cat = category ?? "general";
      const max = limit ?? 10;
      const rankings = await resolved.adapter.getLeaderboard!(cat, max);

      if (rankings.length === 0) {
        return errorResult("No player statistics available for leaderboard.");
      }

      return successResult({
        server_id: resolved.serverId,
        category: cat,
        rankings,
      });
    },
  );

  server.tool(
    "list_mods",
    "List all mods installed in the current modpack with name and version",
    { ...serverIdParam },
    async ({ server_id }) => {
      const resolved = await resolveAdapter(server_id);
      if (!resolved) return server_id ? noServerData(server_id) : noServer();

      const mods = await resolved.adapter.getModListDetailed!();
      if (mods.length === 0) return errorResult("No mods directory found.");

      return successResult({
        server_id: resolved.serverId,
        total_mods: mods.length,
        mods: mods.map((m) => ({
          name: m.name,
          mod_id: m.modId,
          version: m.version,
          filename: m.filename,
        })),
      });
    },
  );

  // Admin-only: run RCON command
  if (adminMode) {
    server.tool(
      "run_command",
      "Execute a server command via RCON (admin only). Server must be running.",
      {
        ...serverIdParam,
        command: z.string().describe("The command to run (e.g. 'list', 'time set day')"),
      },
      async ({ server_id, command }) => {
        const resolved = await resolveAdapter(server_id);
        if (!resolved) return server_id ? noServerData(server_id) : noServer();

        if (!resolved.isRunning) {
          return errorResult(
            `Server "${resolved.serverId}" is not running. RCON commands require a running server.`,
          );
        }

        try {
          const result = await resolved.adapter.runCommand!(command);
          return successResult({ command, output: sanitize(result) || "(no output)" });
        } catch (err) {
          return errorResult(`Command failed: ${(err as Error).message}`);
        }
      },
    );
  }

  // ─── Resources ──────────────────────────────────────────────────────────

  server.resource("modpack-scripts", "modpack://scripts", async (uri) => {
    const resolved = await resolveAdapter();
    if (!resolved) {
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain" as const, text: "No server running." }],
      };
    }

    const scripts = await resolved.adapter.getRecipeScripts!();
    const text = scripts.map((s) => `=== ${s.path} ===\n${s.content}`).join("\n\n");

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain" as const,
          text: text || "No scripts found.",
        },
      ],
    };
  });

  server.resource("modpack-info", "modpack://info", async (uri) => {
    const resolved = await resolveAdapter();
    if (!resolved) {
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

    const [mods, info] = await Promise.all([
      resolved.adapter.getModList!(),
      resolved.adapter.getServerInfo!(),
    ]);

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
    {
      player_name: z.string().optional().describe("Player name (defaults to your linked player)"),
    },
    async ({ player_name }) => {
      const name = player_name ?? playerName;
      const resolved = await resolveAdapter();

      let questInfo = "No quest system detected.";
      if (resolved) {
        const [chapters, progress] = await Promise.all([
          resolved.adapter.getChapters!(),
          resolved.adapter.getQuestProgress!(name),
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
      const resolved = await resolveAdapter();
      let scriptContext = "No recipe scripts available.";

      if (resolved) {
        const result = await resolved.adapter.searchRecipes!(item);

        if (result.structured.length > 0 || result.rawMatches.length > 0) {
          const parts: string[] = [];
          if (result.structured.length > 0) {
            parts.push(`Structured recipes found:\n${JSON.stringify(result.structured, null, 2)}`);
          }
          if (result.rawMatches.length > 0) {
            parts.push(
              "Raw script matches:\n" +
                result.rawMatches
                  .map((m) => `=== ${m.path} ===\n${m.lines.join("\n")}`)
                  .join("\n\n"),
            );
          }
          scriptContext = parts.join("\n\n");
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

const ALLOWED_ORIGINS = new Set([
  "https://game.aypapol.com",
  "https://claude.ai",
  "https://api.anthropic.com",
]);

mcpRoute.post("/mcp", async (c) => {
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
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  return transport.handleRequest(c.req.raw);
});

mcpRoute.get("/mcp", async (c) => {
  return c.json(
    {
      error: "SSE transport not supported. Use POST /api/mcp for Streamable HTTP.",
    },
    405,
  );
});

mcpRoute.delete("/mcp", async (c) => {
  return c.json({ ok: true }, 200);
});

export default mcpRoute;

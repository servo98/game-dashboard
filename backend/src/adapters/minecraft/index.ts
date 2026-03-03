import { existsSync } from "fs";
import { join } from "path";
import { serverQueries } from "../../db";
import { getActiveContainer } from "../../docker";
import type {
  Chapter,
  FormattedStats,
  GameAdapter,
  LeaderboardCategory,
  LeaderboardEntry,
  ModInfo,
  PlayerInfo,
  PlayerInfoExtended,
  QuestDetails,
  QuestProgress,
  StructuredRecipe,
} from "../adapter";
import { registerAdapter } from "../adapter";
import { getAllQuestProgress, getChapters, getQuestDetails, getQuestProgress } from "./quests";
import { execRconCommand } from "./rcon";
import {
  getAllScriptsCached,
  getModList,
  getModListDetailed,
  searchRecipesStructured,
} from "./recipes";
import {
  formatPlayerStats,
  getLeaderboard,
  getPlayerStats,
  getRawPlayerStats,
  listPlayers,
  listPlayersExtended,
} from "./stats";

/**
 * Resolve the data directory for a Minecraft server.
 * The backend container has /data (host) mounted at /host-data,
 * so we translate the host path accordingly.
 */
export function getServerDataPath(serverId: string): string | null {
  const server = serverQueries.getById.get(serverId);
  if (!server) return null;

  const volumes = JSON.parse(server.volumes) as Record<string, string>;
  // Find the volume that maps to /data (itzg/minecraft-server convention)
  for (const [hostPath, containerPath] of Object.entries(volumes)) {
    if (containerPath === "/data") {
      if (hostPath.startsWith("/data/")) {
        return `/host-data/${hostPath.slice(6)}`;
      }
      return hostPath;
    }
  }

  return null;
}

/**
 * Auto-detect which systems are available in this Minecraft server
 * by scanning the filesystem.
 */
function detectSystems(serverRoot: string): string[] {
  const systems: string[] = [];

  if (
    existsSync(join(serverRoot, "world", "ftbquests")) ||
    existsSync(join(serverRoot, "config", "ftbquests"))
  ) {
    systems.push("ftbquests");
  }

  if (existsSync(join(serverRoot, "world", "betterquesting"))) {
    systems.push("betterquesting");
  }

  if (existsSync(join(serverRoot, "kubejs", "server_scripts"))) {
    systems.push("kubejs");
  }

  if (existsSync(join(serverRoot, "scripts"))) {
    systems.push("crafttweaker");
  }

  if (existsSync(join(serverRoot, "mods"))) {
    systems.push("mods");
  }

  return systems;
}

class MinecraftAdapter implements GameAdapter {
  readonly gameType = "minecraft";
  readonly detectedSystems: string[];
  readonly serverId: string;
  private serverRoot: string;

  constructor(serverId: string, serverRoot: string) {
    this.serverId = serverId;
    this.serverRoot = serverRoot;
    this.detectedSystems = detectSystems(serverRoot);
  }

  async getChapters(): Promise<Chapter[]> {
    if (!this.detectedSystems.includes("ftbquests")) return [];
    return getChapters(this.serverRoot);
  }

  async getQuestProgress(playerName: string): Promise<QuestProgress | null> {
    if (!this.detectedSystems.includes("ftbquests")) return null;
    return getQuestProgress(this.serverRoot, playerName);
  }

  async getAllQuestProgress(): Promise<QuestProgress[]> {
    if (!this.detectedSystems.includes("ftbquests")) return [];
    return getAllQuestProgress(this.serverRoot);
  }

  async getQuestDetails(questId: string): Promise<QuestDetails | null> {
    if (!this.detectedSystems.includes("ftbquests")) return null;
    return getQuestDetails(this.serverRoot, questId);
  }

  async getPlayerStats(playerName: string): Promise<Record<string, unknown>> {
    const stats = await getPlayerStats(this.serverRoot, playerName);
    return stats ?? {};
  }

  async getFormattedStats(playerName: string): Promise<FormattedStats | null> {
    const raw = await getRawPlayerStats(this.serverRoot, playerName);
    if (!raw) return null;
    return formatPlayerStats(raw);
  }

  async getLeaderboard(
    category: LeaderboardCategory = "general",
    limit = 10,
  ): Promise<LeaderboardEntry[]> {
    return getLeaderboard(this.serverRoot, category, limit);
  }

  async listPlayers(): Promise<PlayerInfo[]> {
    return listPlayers(this.serverRoot);
  }

  async listPlayersExtended(): Promise<PlayerInfoExtended[]> {
    return listPlayersExtended(this.serverRoot);
  }

  async getRecipeScripts(): Promise<{ path: string; content: string }[]> {
    return getAllScriptsCached(this.serverRoot);
  }

  async searchRecipes(
    itemName: string,
  ): Promise<{ structured: StructuredRecipe[]; rawMatches: { path: string; lines: string[] }[] }> {
    const scripts = await getAllScriptsCached(this.serverRoot);
    return searchRecipesStructured(scripts, itemName);
  }

  async getModList(): Promise<string[]> {
    return getModList(this.serverRoot);
  }

  async getModListDetailed(): Promise<ModInfo[]> {
    return getModListDetailed(this.serverRoot);
  }

  async runCommand(command: string): Promise<string> {
    return execRconCommand(this.serverId, command);
  }

  async getServerInfo(): Promise<Record<string, unknown>> {
    return {
      gameType: this.gameType,
      serverId: this.serverId,
      serverRoot: this.serverRoot,
      detectedSystems: this.detectedSystems,
    };
  }
}

/**
 * Create a MinecraftAdapter for any server by ID.
 * Works even if the server is not running (for file-based operations).
 * Returns null if data path can't be resolved.
 */
export async function createMinecraftAdapter(serverId: string): Promise<MinecraftAdapter | null> {
  const dataPath = getServerDataPath(serverId);
  if (!dataPath) return null;
  return new MinecraftAdapter(serverId, dataPath);
}

/**
 * Create a MinecraftAdapter for the currently active (running) server.
 * Returns null if no server is running.
 */
export async function createActiveMinecraftAdapter(): Promise<MinecraftAdapter | null> {
  const active = await getActiveContainer();
  if (!active) return null;
  return createMinecraftAdapter(active.name);
}

// Register for auto-discovery
registerAdapter("minecraft", () => {
  throw new Error("Use createMinecraftAdapter() for async adapter creation");
});

export { MinecraftAdapter };

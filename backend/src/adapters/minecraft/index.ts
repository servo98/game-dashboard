import { existsSync } from "fs";
import { join } from "path";
import { serverQueries } from "../../db";
import { getActiveContainer } from "../../docker";
import type { Chapter, GameAdapter, PlayerInfo, QuestProgress } from "../adapter";
import { registerAdapter } from "../adapter";
import { getAllQuestProgress, getChapters, getQuestProgress } from "./quests";
import { execRconCommand } from "./rcon";
import { getCraftTweakerScripts, getKubeJSScripts, getModList } from "./recipes";
import { getPlayerStats, listPlayers } from "./stats";

/**
 * Resolve the data directory for the active Minecraft server.
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
      // The backend container mounts /data (host) at /host-data.
      // Translate: /data/minecraft → /host-data/minecraft
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

  // FTB Quests
  if (
    existsSync(join(serverRoot, "world", "ftbquests")) ||
    existsSync(join(serverRoot, "config", "ftbquests"))
  ) {
    systems.push("ftbquests");
  }

  // Better Questing
  if (existsSync(join(serverRoot, "world", "betterquesting"))) {
    systems.push("betterquesting");
  }

  // KubeJS
  if (existsSync(join(serverRoot, "kubejs", "server_scripts"))) {
    systems.push("kubejs");
  }

  // CraftTweaker
  if (existsSync(join(serverRoot, "scripts"))) {
    systems.push("crafttweaker");
  }

  // Mods
  if (existsSync(join(serverRoot, "mods"))) {
    systems.push("mods");
  }

  return systems;
}

class MinecraftAdapter implements GameAdapter {
  readonly gameType = "minecraft";
  readonly detectedSystems: string[];
  private serverRoot: string;
  private serverId: string;

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

  async getPlayerStats(playerName: string): Promise<Record<string, unknown>> {
    const stats = await getPlayerStats(this.serverRoot, playerName);
    return stats ?? {};
  }

  async listPlayers(): Promise<PlayerInfo[]> {
    return listPlayers(this.serverRoot);
  }

  async getRecipeScripts(): Promise<{ path: string; content: string }[]> {
    const scripts: { path: string; content: string }[] = [];

    if (this.detectedSystems.includes("kubejs")) {
      const kubeScripts = await getKubeJSScripts(this.serverRoot);
      scripts.push(...kubeScripts.map((s) => ({ ...s, path: `kubejs/${s.path}` })));
    }

    if (this.detectedSystems.includes("crafttweaker")) {
      const ctScripts = await getCraftTweakerScripts(this.serverRoot);
      scripts.push(...ctScripts.map((s) => ({ ...s, path: `scripts/${s.path}` })));
    }

    return scripts;
  }

  async getModList(): Promise<string[]> {
    return getModList(this.serverRoot);
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
 * Create a MinecraftAdapter for the currently active server, or for a specific server ID.
 * Returns null if no MC server is running or data path can't be resolved.
 */
export async function createMinecraftAdapter(serverId?: string): Promise<MinecraftAdapter | null> {
  let id = serverId;

  if (!id) {
    const active = await getActiveContainer();
    if (!active) return null;
    id = active.name;
  }

  const dataPath = getServerDataPath(id);
  if (!dataPath) return null;

  return new MinecraftAdapter(id, dataPath);
}

// Register for auto-discovery
registerAdapter("minecraft", () => {
  // This is a synchronous factory — callers should use createMinecraftAdapter() directly
  // for proper async resolution. This exists for the registry pattern.
  throw new Error("Use createMinecraftAdapter() for async adapter creation");
});

export { MinecraftAdapter };

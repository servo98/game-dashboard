import type { QuestDetails, QuestReward, QuestTaskDetailed } from "./minecraft/quests";
import type { ModInfo, StructuredRecipe } from "./minecraft/recipes";
import type { FormattedStats, LeaderboardCategory, LeaderboardEntry } from "./minecraft/stats";

export type Chapter = {
  id: string;
  title: string;
  icon: string;
  quests: Quest[];
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  tasks: QuestTask[];
};

export type QuestTask = {
  id: string;
  type: string;
  item?: string;
};

export type QuestProgress = {
  playerName: string;
  completed: string[];
  started: string[];
};

export type PlayerInfo = {
  name: string;
  uuid: string;
};

export type PlayerInfoExtended = PlayerInfo & {
  total_play_time: string;
};

export interface GameAdapter {
  readonly gameType: string;
  readonly serverId: string;
  /** Which optional systems were detected */
  readonly detectedSystems: string[];

  // Quests (optional — not all games/modpacks have them)
  getChapters?(): Promise<Chapter[]>;
  getQuestProgress?(playerName: string): Promise<QuestProgress | null>;
  getAllQuestProgress?(): Promise<QuestProgress[]>;
  getQuestDetails?(questId: string): Promise<QuestDetails | null>;

  // Stats
  getPlayerStats?(playerName: string): Promise<Record<string, unknown>>;
  getFormattedStats?(playerName: string): Promise<FormattedStats | null>;
  getLeaderboard?(category?: LeaderboardCategory, limit?: number): Promise<LeaderboardEntry[]>;
  listPlayers?(): Promise<PlayerInfo[]>;
  listPlayersExtended?(): Promise<PlayerInfoExtended[]>;

  // Recipes/knowledge
  getRecipeScripts?(): Promise<{ path: string; content: string }[]>;
  searchRecipes?(
    itemName: string,
  ): Promise<{ structured: StructuredRecipe[]; rawMatches: { path: string; lines: string[] }[] }>;
  getModList?(): Promise<string[]>;
  getModListDetailed?(): Promise<ModInfo[]>;

  // Commands
  runCommand?(command: string): Promise<string>;

  // Info
  getServerInfo?(): Promise<Record<string, unknown>>;
}

/** Registry of adapters keyed by game_type */
const adapters = new Map<string, () => GameAdapter>();

export function registerAdapter(gameType: string, factory: () => GameAdapter): void {
  adapters.set(gameType, factory);
}

export function getAdapter(gameType: string): GameAdapter | null {
  const factory = adapters.get(gameType);
  return factory ? factory() : null;
}

// Re-export types used by the adapter
export type {
  QuestDetails,
  QuestReward,
  QuestTaskDetailed,
  FormattedStats,
  LeaderboardCategory,
  LeaderboardEntry,
  ModInfo,
  StructuredRecipe,
};

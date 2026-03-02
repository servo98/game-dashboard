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

export interface GameAdapter {
  readonly gameType: string;
  /** Which optional systems were detected */
  readonly detectedSystems: string[];

  // Quests (optional — not all games/modpacks have them)
  getChapters?(): Promise<Chapter[]>;
  getQuestProgress?(playerName: string): Promise<QuestProgress | null>;
  getAllQuestProgress?(): Promise<QuestProgress[]>;

  // Stats
  getPlayerStats?(playerName: string): Promise<Record<string, unknown>>;
  listPlayers?(): Promise<PlayerInfo[]>;

  // Recipes/knowledge
  getRecipeScripts?(): Promise<{ path: string; content: string }[]>;
  getModList?(): Promise<string[]>;

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

import { readdir } from "fs/promises";
import { join } from "path";
import { parseSNBT, type SNBTValue } from "../../snbt";
import type { Chapter, Quest, QuestProgress, QuestTask } from "../adapter";
import { resolveUUIDToName } from "./stats";

type QuestTitleCache = {
  titles: Map<string, string>;
  loadedAt: number;
};

let questTitleCache: QuestTitleCache = { titles: new Map(), loadedAt: 0 };
let chapterCache: { chapters: Chapter[]; loadedAt: number } = {
  chapters: [],
  loadedAt: 0,
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Detect whether FTB Quests is present in this server.
 */
export function hasFTBQuests(serverRoot: string): boolean {
  try {
    return Bun.file(join(serverRoot, "world", "ftbquests")).size >= 0;
  } catch {
    // Check alternative location (older FTB Quests versions)
    try {
      return Bun.file(join(serverRoot, "config", "ftbquests")).size >= 0;
    } catch {
      return false;
    }
  }
}

/**
 * Find the FTB Quests data directory.
 * Different versions store data in different locations.
 */
function findQuestsDir(serverRoot: string): string {
  // Newer: config/ftbquests/quests/
  // Older: world/ftbquests/
  // Most common for modpacks using FTB Quests
  return join(serverRoot, "config", "ftbquests", "quests");
}

function findProgressDir(serverRoot: string): string {
  return join(serverRoot, "world", "ftbquests");
}

/**
 * Read all FTB Quests chapters with their quests.
 * Cached for 5 minutes.
 */
export async function getChapters(serverRoot: string): Promise<Chapter[]> {
  const now = Date.now();
  if (now - chapterCache.loadedAt < CACHE_TTL && chapterCache.chapters.length > 0) {
    return chapterCache.chapters;
  }

  const questsDir = findQuestsDir(serverRoot);
  const chaptersDir = join(questsDir, "chapters");
  const chapters: Chapter[] = [];

  try {
    const files = await readdir(chaptersDir);
    const snbtFiles = files.filter((f) => f.endsWith(".snbt"));

    for (const file of snbtFiles) {
      try {
        const content = await Bun.file(join(chaptersDir, file)).text();
        const data = parseSNBT(content);

        const chapter: Chapter = {
          id: String(data.id ?? file.replace(".snbt", "")),
          title: String(data.title ?? data.filename ?? file.replace(".snbt", "")),
          icon: String(data.icon ?? ""),
          quests: parseQuests(data.quests),
        };

        chapters.push(chapter);
      } catch (err) {
        console.error(`Error parsing chapter ${file}:`, err);
      }
    }
  } catch {
    // chapters dir doesn't exist
  }

  chapterCache = { chapters, loadedAt: now };
  return chapters;
}

function parseQuests(raw: unknown): Quest[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((q: Record<string, SNBTValue>) => ({
    id: String(q.id ?? ""),
    title: String(q.title ?? q.subtitle ?? "Untitled Quest"),
    description: String(q.description ?? q.subtitle ?? ""),
    dependencies: parseDependencies(q.dependencies),
    tasks: parseTasks(q.tasks),
  }));
}

function parseDependencies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => String(d));
}

function parseTasks(raw: unknown): QuestTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: Record<string, SNBTValue>) => ({
    id: String(t.id ?? ""),
    type: String(t.type ?? "unknown"),
    item: t.item ? String(t.item) : undefined,
  }));
}

/**
 * Read quest progress for a specific player.
 * Looks in world/ftbquests/ for player progress files.
 */
export async function getQuestProgress(
  serverRoot: string,
  playerName: string,
): Promise<QuestProgress | null> {
  const progressDir = findProgressDir(serverRoot);

  try {
    // Progress files can be in different locations depending on version:
    // - world/ftbquests/<uuid>.snbt (per-player)
    // - world/ftbquests/progress/<uuid>.snbt (newer)
    const dirs = [progressDir, join(progressDir, "progress")];

    for (const dir of dirs) {
      try {
        const files = await readdir(dir);
        const snbtFiles = files.filter((f) => f.endsWith(".snbt"));

        for (const file of snbtFiles) {
          try {
            const content = await Bun.file(join(dir, file)).text();
            const data = parseSNBT(content);

            // Check if this progress file belongs to the requested player
            const uuid = file.replace(".snbt", "");
            const name = await resolveUUIDToName(serverRoot, uuid);

            if (name && name.toLowerCase() === playerName.toLowerCase()) {
              return {
                playerName: name,
                completed: extractStringArray(data.completed),
                started: extractStringArray(data.started),
              };
            }
          } catch {
            // Skip unparseable files
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
  } catch {
    // Progress dir doesn't exist
  }

  return null;
}

/**
 * Read ALL players' quest progress (used by quest poller).
 */
export async function getAllQuestProgress(serverRoot: string): Promise<QuestProgress[]> {
  const progressDir = findProgressDir(serverRoot);
  const results: QuestProgress[] = [];

  const dirs = [progressDir, join(progressDir, "progress")];

  for (const dir of dirs) {
    try {
      const files = await readdir(dir);
      const snbtFiles = files.filter((f) => f.endsWith(".snbt"));

      for (const file of snbtFiles) {
        try {
          const content = await Bun.file(join(dir, file)).text();
          const data = parseSNBT(content);

          const uuid = file.replace(".snbt", "");
          const name = await resolveUUIDToName(serverRoot, uuid);

          results.push({
            playerName: name ?? uuid,
            completed: extractStringArray(data.completed),
            started: extractStringArray(data.started),
          });
        } catch {
          // Skip
        }
      }
    } catch {
      // Dir doesn't exist
    }
  }

  return results;
}

function extractStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v));
}

/**
 * Build a map of quest ID → quest title from all chapters.
 * Cached for 5 minutes.
 */
export async function getQuestTitleMap(
  serverRoot: string,
): Promise<Map<string, { title: string; chapter: string }>> {
  const now = Date.now();
  if (now - questTitleCache.loadedAt < CACHE_TTL && questTitleCache.titles.size > 0) {
    // Return a mapped version
  }

  const chapters = await getChapters(serverRoot);
  const map = new Map<string, { title: string; chapter: string }>();

  for (const chapter of chapters) {
    for (const quest of chapter.quests) {
      map.set(quest.id, { title: quest.title, chapter: chapter.title });
    }
  }

  return map;
}

/** Invalidate caches (useful when modpack changes) */
export function invalidateQuestCaches(): void {
  chapterCache = { chapters: [], loadedAt: 0 };
  questTitleCache = { titles: new Map(), loadedAt: 0 };
}

import { readdir } from "fs/promises";
import { join } from "path";
import { parseSNBT, type SNBTValue } from "../../snbt";
import type { Chapter, Quest, QuestProgress, QuestTask } from "../adapter";
import { sanitize } from "./sanitize";
import { resolveUUIDToName } from "./stats";

// Per-serverRoot caches
const chapterCaches = new Map<string, { chapters: Chapter[]; loadedAt: number }>();
const CHAPTER_CACHE_TTL = 60 * 60 * 1000; // 1 hour (quest definitions rarely change)

export type QuestReward = {
  type: string;
  item?: string;
  count?: number;
  xp?: number;
  raw?: Record<string, SNBTValue>;
};

export type QuestDetails = {
  id: string;
  title: string;
  description: string;
  chapter: string;
  icon: string;
  tasks: QuestTaskDetailed[];
  rewards: QuestReward[];
  dependencies: string[];
};

export type QuestTaskDetailed = {
  id: string;
  type: string;
  item?: string;
  count?: number;
  raw?: Record<string, SNBTValue>;
};

/**
 * Find the FTB Quests data directory.
 * Different versions store data in different locations.
 */
function findQuestsDir(serverRoot: string): string {
  return join(serverRoot, "config", "ftbquests", "quests");
}

function findProgressDir(serverRoot: string): string {
  return join(serverRoot, "world", "ftbquests");
}

/**
 * Read all FTB Quests chapters with their quests.
 * Cached for 1 hour per server, keyed by serverRoot.
 */
export async function getChapters(serverRoot: string): Promise<Chapter[]> {
  const now = Date.now();
  const cached = chapterCaches.get(serverRoot);
  if (cached && now - cached.loadedAt < CHAPTER_CACHE_TTL && cached.chapters.length > 0) {
    return cached.chapters;
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
          title: sanitize(extractTitle(data, file.replace(".snbt", ""))),
          icon: extractIcon(data),
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

  chapterCaches.set(serverRoot, { chapters, loadedAt: now });
  return chapters;
}

/** Extract title from SNBT data, trying multiple fields */
function extractTitle(data: Record<string, SNBTValue>, fallback: string): string {
  // FTB Quests stores titles in different ways:
  // 1. Direct "title" field (quoted string)
  // 2. "title" as a translation key like "{mypack.chapter.name}"
  // 3. "filename" field (the chapter file's base name, human-readable)
  // 4. "default_quest_shape" etc may have no title — use filename
  const title = data.title;
  if (typeof title === "string" && title.length > 0) {
    // If it's a translation key (starts with {), use filename instead
    if (title.startsWith("{") && title.endsWith("}")) {
      return String(data.filename ?? fallback);
    }
    return title;
  }
  return String(data.filename ?? fallback);
}

/** Extract icon string from SNBT quest/chapter data */
function extractIcon(data: Record<string, SNBTValue>): string {
  const icon = data.icon;
  if (typeof icon === "string") return icon;
  // icon can be an object like {id: "minecraft:diamond"}
  if (icon && typeof icon === "object" && !Array.isArray(icon)) {
    const iconObj = icon as Record<string, SNBTValue>;
    return String(iconObj.id ?? iconObj.item ?? "");
  }
  return "";
}

function parseQuests(raw: unknown): Quest[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((q: Record<string, SNBTValue>) => {
    const title = extractQuestTitle(q);
    const description = extractDescription(q);

    return {
      id: String(q.id ?? ""),
      title: sanitize(title),
      description: sanitize(description),
      dependencies: parseDependencies(q.dependencies),
      tasks: parseTasks(q.tasks),
    };
  });
}

/** Extract quest title trying multiple fields */
function extractQuestTitle(q: Record<string, SNBTValue>): string {
  // 1. Direct title
  if (typeof q.title === "string" && q.title.length > 0) {
    if (q.title.startsWith("{") && q.title.endsWith("}")) {
      // Translation key — try subtitle or task items as fallback
      return extractTitleFromTasks(q) || q.title;
    }
    return q.title;
  }
  // 2. Subtitle
  if (typeof q.subtitle === "string" && q.subtitle.length > 0) {
    return q.subtitle;
  }
  // 3. Try to derive title from tasks (e.g., "Craft minecraft:wooden_pickaxe")
  return extractTitleFromTasks(q) || "Untitled Quest";
}

/** Try to derive a meaningful title from quest tasks */
function extractTitleFromTasks(q: Record<string, SNBTValue>): string {
  if (!Array.isArray(q.tasks)) return "";
  for (const task of q.tasks) {
    const t = task as Record<string, SNBTValue>;
    const item = extractTaskItem(t);
    if (item) {
      const type = String(t.type ?? "item");
      const prefix = type === "kill" || type === "minecraft:kill" ? "Kill" : "Get";
      return `${prefix} ${item.replace(/^minecraft:/, "")}`;
    }
  }
  return "";
}

function extractDescription(q: Record<string, SNBTValue>): string {
  const desc = q.description;
  if (typeof desc === "string") return desc;
  if (Array.isArray(desc)) return desc.map((d) => String(d)).join("\n");
  if (typeof q.subtitle === "string") return q.subtitle;
  return "";
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
    item: extractTaskItem(t),
  }));
}

function parseTasksDetailed(raw: unknown): QuestTaskDetailed[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: Record<string, SNBTValue>) => {
    const result: QuestTaskDetailed = {
      id: String(t.id ?? ""),
      type: String(t.type ?? "unknown"),
    };
    const item = extractTaskItem(t);
    if (item) result.item = item;

    const count = t.count ?? t.value;
    if (typeof count === "number") result.count = count;
    else if (count !== undefined) result.count = Number(count) || 1;

    // Include raw task data for anything we couldn't parse
    const knownKeys = new Set(["id", "type", "item", "count", "value", "uid"]);
    const extra: Record<string, SNBTValue> = {};
    for (const [key, val] of Object.entries(t)) {
      if (!knownKeys.has(key)) extra[key] = val;
    }
    if (Object.keys(extra).length > 0) result.raw = extra;

    return result;
  });
}

/** Extract item ID from a task, handling various formats */
function extractTaskItem(t: Record<string, SNBTValue>): string | undefined {
  // Direct item string: item: "minecraft:diamond"
  if (typeof t.item === "string") return t.item;
  // Item object: item: {id: "minecraft:diamond", Count: 1b}
  if (t.item && typeof t.item === "object" && !Array.isArray(t.item)) {
    const itemObj = t.item as Record<string, SNBTValue>;
    return String(itemObj.id ?? itemObj.item ?? "");
  }
  // Some tasks use "icon" as the item
  if (typeof t.icon === "string") return t.icon;
  return undefined;
}

function parseRewards(raw: unknown): QuestReward[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: Record<string, SNBTValue>) => {
    const result: QuestReward = {
      type: String(r.type ?? "unknown"),
    };

    // Item reward
    if (typeof r.item === "string") {
      result.item = r.item;
    } else if (r.item && typeof r.item === "object" && !Array.isArray(r.item)) {
      const itemObj = r.item as Record<string, SNBTValue>;
      result.item = String(itemObj.id ?? itemObj.item ?? "");
      const count = itemObj.Count ?? itemObj.count;
      if (typeof count === "number") result.count = count;
    }

    // Count
    if (typeof r.count === "number") result.count = r.count;

    // XP reward
    if (typeof r.xp === "number") result.xp = r.xp;
    if (typeof r.xp_levels === "number") result.xp = r.xp_levels;

    // Include raw data for unparsed fields
    const knownKeys = new Set(["type", "item", "count", "xp", "xp_levels", "uid", "id"]);
    const extra: Record<string, SNBTValue> = {};
    for (const [key, val] of Object.entries(r)) {
      if (!knownKeys.has(key)) extra[key] = val;
    }
    if (Object.keys(extra).length > 0) result.raw = extra;

    return result;
  });
}

/**
 * Get detailed information about a specific quest by ID.
 */
export async function getQuestDetails(
  serverRoot: string,
  questId: string,
): Promise<QuestDetails | null> {
  const questsDir = findQuestsDir(serverRoot);
  const chaptersDir = join(questsDir, "chapters");

  try {
    const files = await readdir(chaptersDir);
    const snbtFiles = files.filter((f) => f.endsWith(".snbt"));

    for (const file of snbtFiles) {
      try {
        const content = await Bun.file(join(chaptersDir, file)).text();
        const data = parseSNBT(content);
        const chapterTitle = sanitize(extractTitle(data, file.replace(".snbt", "")));

        if (!Array.isArray(data.quests)) continue;

        for (const q of data.quests as Record<string, SNBTValue>[]) {
          if (String(q.id ?? "") === questId) {
            return {
              id: questId,
              title: sanitize(extractQuestTitle(q)),
              description: sanitize(extractDescription(q)),
              chapter: chapterTitle,
              icon: extractIcon(q),
              tasks: parseTasksDetailed(q.tasks),
              rewards: parseRewards(q.rewards),
              dependencies: parseDependencies(q.dependencies),
            };
          }
        }
      } catch {
        // Skip unparseable files
      }
    }
  } catch {
    // chapters dir doesn't exist
  }

  return null;
}

/**
 * Read quest progress for a specific player.
 */
export async function getQuestProgress(
  serverRoot: string,
  playerName: string,
): Promise<QuestProgress | null> {
  const progressDir = findProgressDir(serverRoot);

  try {
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

            if (name && name.toLowerCase() === playerName.toLowerCase()) {
              return {
                playerName: sanitize(name),
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
 * Read ALL players' quest progress.
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
            playerName: sanitize(name ?? uuid),
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
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  // FTB Quests stores completed/started as maps { questId: timestampL }
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

/**
 * Build a map of quest ID -> quest title from all chapters.
 */
export async function getQuestTitleMap(
  serverRoot: string,
): Promise<Map<string, { title: string; chapter: string }>> {
  const chapters = await getChapters(serverRoot);
  const map = new Map<string, { title: string; chapter: string }>();

  for (const chapter of chapters) {
    for (const quest of chapter.quests) {
      map.set(quest.id, { title: quest.title, chapter: chapter.title });
    }
  }

  return map;
}

/** Invalidate caches for a specific server or all */
export function invalidateQuestCaches(serverRoot?: string): void {
  if (serverRoot) {
    chapterCaches.delete(serverRoot);
  } else {
    chapterCaches.clear();
  }
}

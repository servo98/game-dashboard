import { join } from "path";
import type { PlayerInfo } from "../adapter";
import { sanitize } from "./sanitize";

type UserCacheEntry = {
  uuid: string;
  name: string;
  expiresOn?: string;
};

// Per-serverRoot cache for usercache.json
const userCaches = new Map<string, { data: UserCacheEntry[]; loadedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Read usercache.json from the server root to map UUID <-> player name.
 * Cached for 5 minutes, keyed by serverRoot.
 */
export async function getUserCache(serverRoot: string): Promise<UserCacheEntry[]> {
  const now = Date.now();
  const cached = userCaches.get(serverRoot);
  if (cached && now - cached.loadedAt < CACHE_TTL && cached.data.length > 0) {
    return cached.data;
  }

  try {
    const filePath = join(serverRoot, "usercache.json");
    const text = await Bun.file(filePath).text();
    const data = JSON.parse(text) as UserCacheEntry[];
    userCaches.set(serverRoot, { data, loadedAt: now });
    return data;
  } catch {
    userCaches.set(serverRoot, { data: [], loadedAt: now });
    return [];
  }
}

/** Resolve player name to UUID from usercache */
export async function resolvePlayerUUID(
  serverRoot: string,
  playerName: string,
): Promise<string | null> {
  const cache = await getUserCache(serverRoot);
  const entry = cache.find((e) => e.name.toLowerCase() === playerName.toLowerCase());
  return entry?.uuid ?? null;
}

/** Resolve UUID to player name from usercache */
export async function resolveUUIDToName(serverRoot: string, uuid: string): Promise<string | null> {
  const cache = await getUserCache(serverRoot);
  const normalizedUUID = uuid.replace(/-/g, "");
  const entry = cache.find((e) => e.uuid.replace(/-/g, "") === normalizedUUID);
  return entry?.name ?? null;
}

/** Format UUID to dashed form */
export function toDashedUUID(uuid: string): string {
  const clean = uuid.replace(/-/g, "");
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/** List all known players from usercache with enriched data */
export async function listPlayers(serverRoot: string): Promise<PlayerInfo[]> {
  const cache = await getUserCache(serverRoot);
  return cache.map((e) => ({
    name: sanitize(e.name),
    uuid: e.uuid,
  }));
}

/** List all known players with extended metadata (play time, etc.) */
export async function listPlayersExtended(serverRoot: string): Promise<
  {
    name: string;
    uuid: string;
    total_play_time: string;
  }[]
> {
  const cache = await getUserCache(serverRoot);
  const results: { name: string; uuid: string; total_play_time: string }[] = [];

  for (const entry of cache) {
    const rawStats = await getRawPlayerStats(serverRoot, entry.name);
    let playTime = "unknown";
    if (rawStats) {
      const custom = rawStats.stats?.["minecraft:custom"] as Record<string, number> | undefined;
      const ticks = custom?.["minecraft:play_time"] ?? custom?.["minecraft:play_one_minute"] ?? 0;
      playTime = formatTicks(ticks);
    }
    results.push({
      name: sanitize(entry.name),
      uuid: entry.uuid,
      total_play_time: playTime,
    });
  }

  return results;
}

// ─── Raw Stats ──────────────────────────────────────────────────────────────

type MinecraftStatsFile = {
  stats: Record<string, Record<string, number>>;
  DataVersion?: number;
};

/** Read raw Minecraft per-player statistics from world/stats/<uuid>.json */
export async function getRawPlayerStats(
  serverRoot: string,
  playerName: string,
): Promise<MinecraftStatsFile | null> {
  const uuid = await resolvePlayerUUID(serverRoot, playerName);
  if (!uuid) return null;

  const dashedUUID = toDashedUUID(uuid);
  const statsPath = join(serverRoot, "world", "stats", `${dashedUUID}.json`);

  try {
    const text = await Bun.file(statsPath).text();
    return JSON.parse(text) as MinecraftStatsFile;
  } catch {
    return null;
  }
}

/** Get all players' raw stats for leaderboard */
export async function getAllPlayerRawStats(
  serverRoot: string,
): Promise<{ name: string; uuid: string; stats: MinecraftStatsFile }[]> {
  const cache = await getUserCache(serverRoot);
  const results: { name: string; uuid: string; stats: MinecraftStatsFile }[] = [];

  for (const entry of cache) {
    const dashedUUID = toDashedUUID(entry.uuid);
    const statsPath = join(serverRoot, "world", "stats", `${dashedUUID}.json`);
    try {
      const text = await Bun.file(statsPath).text();
      const stats = JSON.parse(text) as MinecraftStatsFile;
      results.push({ name: sanitize(entry.name), uuid: entry.uuid, stats });
    } catch {
      // No stats file for this player
    }
  }

  return results;
}

// ─── Legacy wrapper (keeps old API working) ─────────────────────────────────

export async function getPlayerStats(
  serverRoot: string,
  playerName: string,
): Promise<Record<string, unknown> | null> {
  const raw = await getRawPlayerStats(serverRoot, playerName);
  if (!raw) return null;
  return raw.stats ?? {};
}

// ─── Formatted Stats ────────────────────────────────────────────────────────

export type FormattedStats = {
  movement: Record<string, string>;
  time: Record<string, string>;
  combat: Record<string, string>;
  mining: Record<string, string>;
  crafting: Record<string, string>;
  interactions: Record<string, string>;
  raw: Record<string, Record<string, number>>;
};

/** Convert raw Minecraft stats to human-readable grouped format */
export function formatPlayerStats(rawFile: MinecraftStatsFile): FormattedStats {
  const stats = rawFile.stats;
  const custom = (stats["minecraft:custom"] ?? {}) as Record<string, number>;
  const mined = (stats["minecraft:mined"] ?? {}) as Record<string, number>;
  const crafted = (stats["minecraft:crafted"] ?? {}) as Record<string, number>;
  const killed = (stats["minecraft:killed"] ?? {}) as Record<string, number>;
  const killedBy = (stats["minecraft:killed_by"] ?? {}) as Record<string, number>;
  const _used = (stats["minecraft:used"] ?? {}) as Record<string, number>;
  const _picked = (stats["minecraft:picked_up"] ?? {}) as Record<string, number>;
  const _dropped = (stats["minecraft:dropped"] ?? {}) as Record<string, number>;

  // Movement (values in cm → m/km)
  const movement: Record<string, string> = {};
  const movementKeys: Record<string, string> = {
    "minecraft:walk_one_cm": "walked",
    "minecraft:sprint_one_cm": "sprinted",
    "minecraft:swim_one_cm": "swam",
    "minecraft:fly_one_cm": "flew (elytra)",
    "minecraft:aviate_one_cm": "flew (elytra)",
    "minecraft:fall_one_cm": "fallen",
    "minecraft:climb_one_cm": "climbed",
    "minecraft:crouch_one_cm": "crouched",
    "minecraft:boat_one_cm": "by boat",
    "minecraft:minecart_one_cm": "by minecart",
    "minecraft:horse_one_cm": "by horse",
    "minecraft:pig_one_cm": "by pig",
    "minecraft:strider_one_cm": "by strider",
    "minecraft:walk_under_water_one_cm": "walked underwater",
    "minecraft:walk_on_water_one_cm": "walked on water",
  };
  for (const [key, label] of Object.entries(movementKeys)) {
    if (custom[key]) movement[label] = formatDistance(custom[key]);
  }

  // Time (values in ticks → readable time)
  const time: Record<string, string> = {};
  const timeKeys: Record<string, string> = {
    "minecraft:play_time": "play_time",
    "minecraft:play_one_minute": "play_time", // legacy key, same meaning
    "minecraft:time_since_death": "since_last_death",
    "minecraft:time_since_rest": "since_last_rest",
    "minecraft:sneak_time": "time_sneaking",
  };
  for (const [key, label] of Object.entries(timeKeys)) {
    if (custom[key] && !time[label]) time[label] = formatTicks(custom[key]);
  }

  // Combat
  const combat: Record<string, string> = {};
  if (custom["minecraft:damage_dealt"])
    combat.damage_dealt = formatHearts(custom["minecraft:damage_dealt"]);
  if (custom["minecraft:damage_taken"])
    combat.damage_taken = formatHearts(custom["minecraft:damage_taken"]);
  if (custom["minecraft:damage_absorbed"])
    combat.damage_absorbed = formatHearts(custom["minecraft:damage_absorbed"]);
  if (custom["minecraft:deaths"] !== undefined) combat.deaths = String(custom["minecraft:deaths"]);
  if (custom["minecraft:player_kills"] !== undefined)
    combat.player_kills = String(custom["minecraft:player_kills"]);
  if (custom["minecraft:mob_kills"] !== undefined)
    combat.mob_kills = String(custom["minecraft:mob_kills"]);

  // Top killed mobs
  const sortedKills = Object.entries(killed).sort((a, b) => b[1] - a[1]);
  for (const [mob, count] of sortedKills.slice(0, 10)) {
    combat[`killed_${stripNamespace(mob)}`] = String(count);
  }
  // Top killed by
  const sortedDeaths = Object.entries(killedBy).sort((a, b) => b[1] - a[1]);
  for (const [mob, count] of sortedDeaths.slice(0, 5)) {
    combat[`killed_by_${stripNamespace(mob)}`] = String(count);
  }

  // Mining - top 15 blocks mined
  const mining: Record<string, string> = {};
  const sortedMined = Object.entries(mined).sort((a, b) => b[1] - a[1]);
  for (const [block, count] of sortedMined.slice(0, 15)) {
    mining[stripNamespace(block)] = String(count);
  }

  // Crafting - top 15 items crafted
  const craftingResult: Record<string, string> = {};
  const sortedCrafted = Object.entries(crafted).sort((a, b) => b[1] - a[1]);
  for (const [item, count] of sortedCrafted.slice(0, 15)) {
    craftingResult[stripNamespace(item)] = String(count);
  }

  // Interactions (misc custom stats)
  const interactions: Record<string, string> = {};
  const interactionKeys: Record<string, string> = {
    "minecraft:open_chest": "chests_opened",
    "minecraft:open_enderchest": "ender_chests_opened",
    "minecraft:open_shulker_box": "shulker_boxes_opened",
    "minecraft:enchant_item": "items_enchanted",
    "minecraft:traded_with_villager": "villager_trades",
    "minecraft:talked_to_villager": "villager_talks",
    "minecraft:eat_cake_slice": "cake_slices_eaten",
    "minecraft:fill_cauldron": "cauldrons_filled",
    "minecraft:inspect_hopper": "hoppers_inspected",
    "minecraft:interact_with_crafting_table": "crafting_table_uses",
    "minecraft:interact_with_furnace": "furnace_uses",
    "minecraft:interact_with_anvil": "anvil_uses",
    "minecraft:interact_with_brewingstand": "brewing_stand_uses",
    "minecraft:sleep_in_bed": "slept_in_bed",
    "minecraft:fish_caught": "fish_caught",
    "minecraft:animals_bred": "animals_bred",
    "minecraft:jump": "jumps",
  };
  for (const [key, label] of Object.entries(interactionKeys)) {
    if (custom[key]) interactions[label] = String(custom[key]);
  }

  return {
    movement,
    time,
    combat,
    mining,
    crafting: craftingResult,
    interactions,
    raw: stats as Record<string, Record<string, number>>,
  };
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export type LeaderboardCategory = "general" | "combat" | "mining" | "exploration" | "farming";

export type LeaderboardEntry = {
  player: string;
  stats: Record<string, string | number>;
};

export async function getLeaderboard(
  serverRoot: string,
  category: LeaderboardCategory = "general",
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const allStats = await getAllPlayerRawStats(serverRoot);
  if (allStats.length === 0) return [];

  const entries: { player: string; stats: MinecraftStatsFile; sortValue: number }[] = [];

  for (const { name, stats } of allStats) {
    const custom = (stats.stats["minecraft:custom"] ?? {}) as Record<string, number>;
    let sortValue = 0;

    switch (category) {
      case "general":
        sortValue = custom["minecraft:play_time"] ?? custom["minecraft:play_one_minute"] ?? 0;
        break;
      case "combat":
        sortValue = custom["minecraft:mob_kills"] ?? 0;
        break;
      case "mining": {
        const mined = stats.stats["minecraft:mined"] ?? {};
        sortValue = Object.values(mined).reduce((sum, v) => sum + (v as number), 0);
        break;
      }
      case "exploration": {
        const walk = custom["minecraft:walk_one_cm"] ?? 0;
        const sprint = custom["minecraft:sprint_one_cm"] ?? 0;
        const fly = custom["minecraft:aviate_one_cm"] ?? custom["minecraft:fly_one_cm"] ?? 0;
        const boat = custom["minecraft:boat_one_cm"] ?? 0;
        sortValue = walk + sprint + fly + boat;
        break;
      }
      case "farming":
        sortValue = custom["minecraft:animals_bred"] ?? 0;
        break;
    }

    entries.push({ player: name, stats, sortValue });
  }

  entries.sort((a, b) => b.sortValue - a.sortValue);

  return entries.slice(0, limit).map(({ player, stats }) => {
    const custom = (stats.stats["minecraft:custom"] ?? {}) as Record<string, number>;
    const mined = stats.stats["minecraft:mined"] ?? {};
    const killed = stats.stats["minecraft:killed"] ?? {};
    const crafted = stats.stats["minecraft:crafted"] ?? {};

    const resultStats: Record<string, string | number> = {};

    switch (category) {
      case "general":
        resultStats.play_time = formatTicks(
          custom["minecraft:play_time"] ?? custom["minecraft:play_one_minute"] ?? 0,
        );
        resultStats.blocks_mined = Object.values(mined).reduce((sum, v) => sum + (v as number), 0);
        resultStats.mobs_killed = custom["minecraft:mob_kills"] ?? 0;
        resultStats.deaths = custom["minecraft:deaths"] ?? 0;
        resultStats.distance_traveled = formatDistance(
          (custom["minecraft:walk_one_cm"] ?? 0) +
            (custom["minecraft:sprint_one_cm"] ?? 0) +
            (custom["minecraft:aviate_one_cm"] ?? custom["minecraft:fly_one_cm"] ?? 0) +
            (custom["minecraft:boat_one_cm"] ?? 0),
        );
        resultStats.items_crafted = Object.values(crafted).reduce(
          (sum, v) => sum + (v as number),
          0,
        );
        break;
      case "combat":
        resultStats.mob_kills = custom["minecraft:mob_kills"] ?? 0;
        resultStats.player_kills = custom["minecraft:player_kills"] ?? 0;
        resultStats.deaths = custom["minecraft:deaths"] ?? 0;
        resultStats.damage_dealt = formatHearts(custom["minecraft:damage_dealt"] ?? 0);
        resultStats.damage_taken = formatHearts(custom["minecraft:damage_taken"] ?? 0);
        // Top 3 mobs killed
        for (const [mob, count] of Object.entries(killed as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)) {
          resultStats[`top_kill_${stripNamespace(mob)}`] = count;
        }
        break;
      case "mining":
        resultStats.total_blocks_mined = Object.values(mined).reduce(
          (sum, v) => sum + (v as number),
          0,
        );
        // Top 5 blocks
        for (const [block, count] of Object.entries(mined as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)) {
          resultStats[stripNamespace(block)] = count;
        }
        break;
      case "exploration":
        resultStats.walked = formatDistance(custom["minecraft:walk_one_cm"] ?? 0);
        resultStats.sprinted = formatDistance(custom["minecraft:sprint_one_cm"] ?? 0);
        resultStats.flew = formatDistance(
          custom["minecraft:aviate_one_cm"] ?? custom["minecraft:fly_one_cm"] ?? 0,
        );
        resultStats.by_boat = formatDistance(custom["minecraft:boat_one_cm"] ?? 0);
        resultStats.swam = formatDistance(custom["minecraft:swim_one_cm"] ?? 0);
        break;
      case "farming":
        resultStats.animals_bred = custom["minecraft:animals_bred"] ?? 0;
        resultStats.fish_caught = custom["minecraft:fish_caught"] ?? 0;
        resultStats.villager_trades = custom["minecraft:traded_with_villager"] ?? 0;
        break;
    }

    return { player, stats: resultStats };
  });
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function stripNamespace(id: string): string {
  return id.replace(/^minecraft:/, "");
}

/** Convert centimeters to human-readable distance */
function formatDistance(cm: number): string {
  const m = cm / 100;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/** Convert ticks (20/sec) to human-readable time */
export function formatTicks(ticks: number): string {
  const totalSeconds = Math.floor(ticks / 20);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

/** Convert damage (in half-hearts * 10) to hearts */
function formatHearts(raw: number): string {
  const hearts = raw / 20;
  return `${hearts.toFixed(1)} hearts`;
}

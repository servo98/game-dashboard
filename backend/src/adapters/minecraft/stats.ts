import { readdir } from "fs/promises";
import { join } from "path";
import type { PlayerInfo } from "../adapter";

type UserCacheEntry = {
  uuid: string;
  name: string;
  expiresOn?: string;
};

let userCacheData: UserCacheEntry[] = [];
let userCacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Read usercache.json from the server root to map UUID → player name.
 * Cached for 5 minutes.
 */
export async function getUserCache(serverRoot: string): Promise<UserCacheEntry[]> {
  const now = Date.now();
  if (now - userCacheLoadedAt < CACHE_TTL && userCacheData.length > 0) {
    return userCacheData;
  }

  try {
    const filePath = join(serverRoot, "usercache.json");
    const text = await Bun.file(filePath).text();
    userCacheData = JSON.parse(text) as UserCacheEntry[];
    userCacheLoadedAt = now;
  } catch {
    // File may not exist yet
    userCacheData = [];
  }

  return userCacheData;
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
  // UUID in usercache may or may not have dashes
  const normalizedUUID = uuid.replace(/-/g, "");
  const entry = cache.find((e) => e.uuid.replace(/-/g, "") === normalizedUUID);
  return entry?.name ?? null;
}

/** List all known players from usercache */
export async function listPlayers(serverRoot: string): Promise<PlayerInfo[]> {
  const cache = await getUserCache(serverRoot);
  return cache.map((e) => ({ name: e.name, uuid: e.uuid }));
}

/**
 * Read Minecraft per-player statistics from world/stats/<uuid>.json
 */
export async function getPlayerStats(
  serverRoot: string,
  playerName: string,
): Promise<Record<string, unknown> | null> {
  const uuid = await resolvePlayerUUID(serverRoot, playerName);
  if (!uuid) return null;

  // Stats file uses UUID with dashes
  const dashedUUID = uuid.includes("-")
    ? uuid
    : `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;

  const statsPath = join(serverRoot, "world", "stats", `${dashedUUID}.json`);

  try {
    const text = await Bun.file(statsPath).text();
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

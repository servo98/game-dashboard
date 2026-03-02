import { readdir } from "fs/promises";
import { join } from "path";

/**
 * Read KubeJS server scripts (recipe modifications, custom recipes, etc.)
 */
export async function getKubeJSScripts(
  serverRoot: string,
): Promise<{ path: string; content: string }[]> {
  const scriptsDir = join(serverRoot, "kubejs", "server_scripts");
  return readScriptsFromDir(scriptsDir, ".js");
}

/**
 * Read CraftTweaker scripts (.zs files)
 */
export async function getCraftTweakerScripts(
  serverRoot: string,
): Promise<{ path: string; content: string }[]> {
  const scriptsDir = join(serverRoot, "scripts");
  return readScriptsFromDir(scriptsDir, ".zs");
}

async function readScriptsFromDir(
  dir: string,
  extension: string,
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];

  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(extension)) {
        const fullPath = join(entry.parentPath ?? dir, entry.name);
        try {
          const content = await Bun.file(fullPath).text();
          // Store relative path from scripts dir
          const relativePath = fullPath.slice(dir.length + 1).replace(/\\/g, "/");
          results.push({ path: relativePath, content });
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results;
}

/**
 * List all mod JARs installed in the mods/ directory
 */
export async function getModList(serverRoot: string): Promise<string[]> {
  const modsDir = join(serverRoot, "mods");
  try {
    const entries = await readdir(modsDir);
    return entries
      .filter((name) => name.endsWith(".jar"))
      .map((name) => name.replace(/\.jar$/, ""))
      .sort();
  } catch {
    return [];
  }
}

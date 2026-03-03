import { readdir } from "fs/promises";
import { join } from "path";

// Cache per serverRoot
const scriptCaches = new Map<string, { scripts: ScriptFile[]; loadedAt: number }>();
const modListCaches = new Map<string, { mods: ModInfo[]; loadedAt: number }>();
const SCRIPTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MODS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

type ScriptFile = { path: string; content: string };

export type ModInfo = {
  filename: string;
  modId: string;
  name: string;
  version: string;
  description: string;
};

export type StructuredRecipe = {
  type: string;
  output?: string;
  outputCount?: number;
  inputs?: string[];
  recipe_id?: string;
  mod?: string;
  source_script: string;
  raw_line: string;
};

// ─── Script Reading ─────────────────────────────────────────────────────────

/**
 * Read KubeJS server scripts, cached for 1 hour.
 */
export async function getKubeJSScripts(serverRoot: string): Promise<ScriptFile[]> {
  const scriptsDir = join(serverRoot, "kubejs", "server_scripts");
  return readScriptsFromDir(scriptsDir, ".js");
}

/**
 * Read CraftTweaker scripts (.zs files), cached for 1 hour.
 */
export async function getCraftTweakerScripts(serverRoot: string): Promise<ScriptFile[]> {
  const scriptsDir = join(serverRoot, "scripts");
  return readScriptsFromDir(scriptsDir, ".zs");
}

async function readScriptsFromDir(dir: string, extension: string): Promise<ScriptFile[]> {
  const results: ScriptFile[] = [];

  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(extension)) {
        const fullPath = join(entry.parentPath ?? dir, entry.name);
        try {
          const content = await Bun.file(fullPath).text();
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

/** Get all scripts with caching */
export async function getAllScriptsCached(serverRoot: string): Promise<ScriptFile[]> {
  const now = Date.now();
  const cached = scriptCaches.get(serverRoot);
  if (cached && now - cached.loadedAt < SCRIPTS_CACHE_TTL) {
    return cached.scripts;
  }

  const scripts: ScriptFile[] = [];
  const kubeScripts = await getKubeJSScripts(serverRoot);
  scripts.push(...kubeScripts.map((s) => ({ ...s, path: `kubejs/${s.path}` })));

  const ctScripts = await getCraftTweakerScripts(serverRoot);
  scripts.push(...ctScripts.map((s) => ({ ...s, path: `scripts/${s.path}` })));

  scriptCaches.set(serverRoot, { scripts, loadedAt: now });
  return scripts;
}

// ─── Structured Recipe Parsing ──────────────────────────────────────────────

/**
 * Search scripts for an item and return structured recipe data where possible.
 * Falls back to raw relevant lines when parsing fails.
 */
export function searchRecipesStructured(
  scripts: ScriptFile[],
  itemName: string,
): { structured: StructuredRecipe[]; rawMatches: { path: string; lines: string[] }[] } {
  const lower = itemName.toLowerCase();
  const structured: StructuredRecipe[] = [];
  const rawMatches: { path: string; lines: string[] }[] = [];

  for (const script of scripts) {
    if (!script.content.toLowerCase().includes(lower)) continue;

    const lines = script.content.split("\n");
    const matchingLines: string[] = [];

    for (const line of lines) {
      if (!line.toLowerCase().includes(lower)) continue;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      // Try to parse as a KubeJS recipe call
      const parsed = tryParseKubeJSLine(trimmed, script.path);
      if (parsed) {
        structured.push(parsed);
      } else {
        matchingLines.push(trimmed);
      }
    }

    if (matchingLines.length > 0) {
      rawMatches.push({ path: script.path, lines: matchingLines.slice(0, 20) });
    }
  }

  return { structured, rawMatches };
}

/** Try to parse a single KubeJS recipe line into structured data */
function tryParseKubeJSLine(line: string, sourcePath: string): StructuredRecipe | null {
  // Common KubeJS patterns:
  // event.shaped('output', ['AAA', 'ABA', 'AAA'], {A: 'item', B: 'item'})
  // event.shapeless('output', ['input1', 'input2'])
  // event.smelting('output', 'input')
  // event.remove({id: 'recipe_id'})
  // event.remove({output: 'item'})
  // event.replaceInput({}, 'old', 'new')
  // event.custom({...})
  // event.recipes.mod.recipe_type(...)

  try {
    // Shaped recipe
    const shapedMatch = line.match(
      /\.shaped\s*\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]+)\]\s*,\s*\{([^}]+)\}/,
    );
    if (shapedMatch) {
      const output = shapedMatch[1];
      const ingredients = extractIngredients(shapedMatch[3]);
      return {
        type: "shaped",
        output,
        inputs: ingredients,
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Shapeless recipe
    const shapelessMatch = line.match(/\.shapeless\s*\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]+)\]/);
    if (shapelessMatch) {
      const output = shapelessMatch[1];
      const inputs = extractItemList(shapelessMatch[2]);
      return {
        type: "shapeless",
        output,
        inputs,
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Smelting/blasting/smoking
    const smeltMatch = line.match(
      /\.(smelting|blasting|smoking|campfireCooking)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/,
    );
    if (smeltMatch) {
      return {
        type: smeltMatch[1],
        output: smeltMatch[2],
        inputs: [smeltMatch[3]],
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Stonecutting
    const stonecutMatch = line.match(
      /\.stonecutting\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/,
    );
    if (stonecutMatch) {
      return {
        type: "stonecutting",
        output: stonecutMatch[1],
        inputs: [stonecutMatch[2]],
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Remove recipe
    const removeIdMatch = line.match(/\.remove\s*\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/);
    if (removeIdMatch) {
      return {
        type: "remove",
        recipe_id: removeIdMatch[1],
        source_script: sourcePath,
        raw_line: line,
      };
    }

    const removeOutputMatch = line.match(/\.remove\s*\(\s*\{\s*output\s*:\s*['"]([^'"]+)['"]/);
    if (removeOutputMatch) {
      return {
        type: "remove",
        output: removeOutputMatch[1],
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Replace input
    const replaceMatch = line.match(
      /\.replaceInput\s*\([^,]*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/,
    );
    if (replaceMatch) {
      return {
        type: "replace_input",
        inputs: [replaceMatch[1]],
        output: replaceMatch[2],
        source_script: sourcePath,
        raw_line: line,
      };
    }

    // Mod-specific: event.recipes.mod.type(...)
    const modRecipeMatch = line.match(/\.recipes\.(\w+)\.(\w+)\s*\(([^)]*)\)/);
    if (modRecipeMatch) {
      const mod = modRecipeMatch[1];
      const type = modRecipeMatch[2];
      const items = extractItemList(modRecipeMatch[3]);
      return {
        type: `${mod}:${type}`,
        mod,
        inputs: items.length > 1 ? items.slice(1) : items,
        output: items[0],
        source_script: sourcePath,
        raw_line: line,
      };
    }
  } catch {
    // Parsing failed, fall through
  }

  return null;
}

/** Extract ingredient items from a KubeJS mapping like "A: 'item1', B: 'item2'" */
function extractIngredients(mapping: string): string[] {
  const items: string[] = [];
  const itemRegex = /['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(mapping)) !== null) {
    items.push(match[1]);
  }
  return [...new Set(items)];
}

/** Extract item IDs from a comma-separated list */
function extractItemList(list: string): string[] {
  const items: string[] = [];
  const itemRegex = /['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(list)) !== null) {
    items.push(match[1]);
  }
  return items;
}

// ─── Mod List ───────────────────────────────────────────────────────────────

/**
 * List all mod JARs with metadata parsed from filenames.
 * Parses the common "modname-version.jar" pattern.
 * Cached for 1 hour.
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

/**
 * List mods with parsed metadata from filenames.
 * Pattern: "ModName-1.20.1-2.3.4.jar" → {name: "ModName", version: "2.3.4"}
 */
export async function getModListDetailed(serverRoot: string): Promise<ModInfo[]> {
  const now = Date.now();
  const cached = modListCaches.get(serverRoot);
  if (cached && now - cached.loadedAt < MODS_CACHE_TTL) {
    return cached.mods;
  }

  const modsDir = join(serverRoot, "mods");
  const mods: ModInfo[] = [];

  try {
    const entries = await readdir(modsDir);
    const jars = entries.filter((name) => name.endsWith(".jar")).sort();

    for (const jar of jars) {
      const baseName = jar.replace(/\.jar$/, "");
      const parsed = parseModFilename(baseName);
      mods.push({
        filename: jar,
        modId: parsed.modId,
        name: parsed.name,
        version: parsed.version,
        description: "",
      });
    }
  } catch {
    // mods dir doesn't exist
  }

  modListCaches.set(serverRoot, { mods, loadedAt: now });
  return mods;
}

/**
 * Parse a mod filename like "jei-1.20.1-forge-15.2.0.27" into parts.
 * Common patterns:
 * - "modname-mcversion-modversion"
 * - "modname-mcversion-loader-modversion"
 * - "modname-modversion"
 */
function parseModFilename(name: string): { modId: string; name: string; version: string } {
  // Try to split on version-like patterns
  // MC versions: 1.20, 1.20.1, 1.20.1-forge, etc.
  const mcVersionPattern = /[-_](1\.\d+(?:\.\d+)?(?:[-_](?:forge|fabric|neoforge|quilt))?)/;
  const match = name.match(mcVersionPattern);

  if (match) {
    const idx = name.indexOf(match[0]);
    const modName = name.slice(0, idx);
    const rest = name.slice(idx + match[0].length).replace(/^[-_]/, "");

    // Rest after MC version is the mod version
    const modVersion = rest || "unknown";

    return {
      modId: modName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      name: modName.replace(/[-_]/g, " "),
      version: modVersion,
    };
  }

  // Fallback: last segment that looks like a version
  const versionMatch = name.match(/([\d]+\.[\d]+(?:\.[\d]+)*(?:[-_.][\w]+)*)$/);
  if (versionMatch) {
    const modName = name.slice(0, name.length - versionMatch[0].length).replace(/[-_]+$/, "");
    return {
      modId: modName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      name: modName.replace(/[-_]/g, " "),
      version: versionMatch[1],
    };
  }

  return {
    modId: name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    name: name.replace(/[-_]/g, " "),
    version: "unknown",
  };
}

/** Invalidate recipe/mod caches */
export function invalidateRecipeCaches(serverRoot?: string): void {
  if (serverRoot) {
    scriptCaches.delete(serverRoot);
    modListCaches.delete(serverRoot);
  } else {
    scriptCaches.clear();
    modListCaches.clear();
  }
}

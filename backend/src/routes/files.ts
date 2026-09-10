import { mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "fs";
import { Hono } from "hono";
import { dirname, join, resolve } from "path";
import type { Session } from "../db";
import { serverQueries } from "../db";
import { requireAdmin, requireApproved, requireAuth } from "../middleware/auth";

const HOST_DATA_DIR = "/host-data";

type VolumeMapping = {
  hostPath: string;
  containerPath: string;
  /** Path accessible from backend container: /host-data/<relative> */
  accessPath: string;
};

function parseVolumes(volumesJson: string): VolumeMapping[] {
  const volumes = JSON.parse(volumesJson) as Record<string, string>;
  return Object.entries(volumes)
    .filter(([hostPath]) => hostPath.startsWith("/data/"))
    .map(([hostPath, containerPath]) => ({
      hostPath,
      containerPath,
      accessPath: join(HOST_DATA_DIR, hostPath.replace(/^\/data\//, "")),
    }));
}

/**
 * Resolve a user-provided path to a safe filesystem path within volume bounds.
 * Returns null if the path escapes volume boundaries.
 */
function resolveSafePath(
  volumes: VolumeMapping[],
  requestedPath: string,
): { fsPath: string; isVirtualRoot: boolean } | null {
  // Normalize: strip leading slash for easier handling
  const normalized = requestedPath.replace(/^\/+/, "");

  // Single-volume: paths are relative to the volume root
  if (volumes.length === 1) {
    const vol = volumes[0];
    const target = resolve(vol.accessPath, normalized);

    // Must be within the volume's access path
    if (!target.startsWith(vol.accessPath)) return null;

    // Symlink check: resolve real path and re-verify
    try {
      const real = realpathSync(target);
      if (!real.startsWith(vol.accessPath)) return null;
    } catch {
      // Target doesn't exist yet (e.g. for mkdir) — that's ok, parent resolved check is enough
      const parentTarget = resolve(target, "..");
      if (!parentTarget.startsWith(vol.accessPath)) return null;
    }

    return { fsPath: target, isVirtualRoot: false };
  }

  // Multi-volume: root "/" returns virtual listing of mount points
  if (normalized === "") {
    return { fsPath: "", isVirtualRoot: true };
  }

  // Find which volume this path belongs to by matching the container path prefix
  for (const vol of volumes) {
    const prefix = vol.containerPath.replace(/^\/+/, "");
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      const relative = normalized.slice(prefix.length).replace(/^\/+/, "");
      const target = resolve(vol.accessPath, relative);

      if (!target.startsWith(vol.accessPath)) return null;

      try {
        const real = realpathSync(target);
        if (!real.startsWith(vol.accessPath)) return null;
      } catch {
        const parentTarget = resolve(target, "..");
        if (!parentTarget.startsWith(vol.accessPath)) return null;
      }

      return { fsPath: target, isVirtualRoot: false };
    }
  }

  return null;
}

const files = new Hono<{ Variables: { session: Session } }>();

// List directory
files.get("/:id/files", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "/";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved) return c.json({ error: "Invalid path" }, 403);

  // Virtual root for multi-volume servers
  if (resolved.isVirtualRoot) {
    const entries = volumes.map((v) => ({
      name: v.containerPath.replace(/^\/+/, ""),
      isDirectory: true,
      size: 0,
      modifiedAt: 0,
    }));
    return c.json(entries);
  }

  try {
    const stat = statSync(resolved.fsPath);
    if (!stat.isDirectory()) {
      return c.json({ error: "Not a directory" }, 400);
    }

    const items = readdirSync(resolved.fsPath);
    const entries = items
      .map((name) => {
        try {
          const itemPath = join(resolved.fsPath, name);
          const s = statSync(itemPath);
          return {
            name,
            isDirectory: s.isDirectory(),
            size: s.isDirectory() ? 0 : s.size,
            modifiedAt: Math.floor(s.mtimeMs / 1000),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Dirs first, then alphabetical
    entries.sort((a, b) => {
      if (a!.isDirectory && !b!.isDirectory) return -1;
      if (!a!.isDirectory && b!.isDirectory) return 1;
      return a!.name.localeCompare(b!.name);
    });

    return c.json(entries);
  } catch {
    return c.json({ error: "Failed to read directory" }, 500);
  }
});

// Download file
files.get("/:id/files/download", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "/";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  try {
    const stat = statSync(resolved.fsPath);
    if (stat.isDirectory()) {
      return c.json({ error: "Cannot download a directory" }, 400);
    }

    const file = Bun.file(resolved.fsPath);
    const fileName = resolved.fsPath.split("/").pop() ?? "file";

    return new Response(file.stream(), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// Upload files (multipart)
files.post("/:id/files/upload", requireAuth, requireApproved, requireAdmin, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "/";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart/form-data" }, 400);
  }

  try {
    const formData = await c.req.formData();
    const relativePathField = formData.get("relativePath");
    const uploaded: string[] = [];

    for (const [key, value] of formData.entries()) {
      if (key === "relativePath") continue;
      if (typeof value === "string") continue;
      const file = value as unknown as File;

      // 1GB per file limit
      if (file.size > 1024 * 1024 * 1024) {
        return c.json({ error: `File ${file.name} exceeds 1GB limit` }, 400);
      }

      // Use the relative path (folder structure) when provided, else just the file name
      const rawRel =
        typeof relativePathField === "string" && relativePathField.length > 0
          ? relativePathField
          : file.name;
      // Normalize separators, drop empty/"." segments, and reject any ".." traversal
      const segments = rawRel
        .replace(/\\/g, "/")
        .split("/")
        .filter((seg) => seg && seg !== ".");
      if (segments.length === 0 || segments.some((seg) => seg === "..")) {
        return c.json({ error: `Invalid file name: ${rawRel}` }, 403);
      }
      const safeRel = segments.join("/");

      const targetPath = resolve(join(resolved.fsPath, safeRel));
      // Re-verify the target is still within a volume's bounds
      const vol = volumes.find((v) => targetPath.startsWith(v.accessPath));
      if (!vol) return c.json({ error: `Invalid file name: ${rawRel}` }, 403);

      // Recreate parent folders (for nested uploads from dropped directories)
      mkdirSync(dirname(targetPath), { recursive: true });

      // Escribir el File directamente: Bun.write hace streaming del blob a
      // disco sin materializar otra copia completa en memoria (evita OOM).
      await Bun.write(targetPath, file);
      uploaded.push(safeRel);
    }

    return c.json({ ok: true, uploaded });
  } catch (err) {
    console.error("Upload error:", err);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Delete file or directory
files.delete("/:id/files", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "/";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  // Block deletion of volume root itself
  for (const vol of volumes) {
    if (resolved.fsPath === vol.accessPath) {
      return c.json({ error: "Cannot delete volume root" }, 403);
    }
  }

  try {
    const stat = statSync(resolved.fsPath);
    rmSync(resolved.fsPath, { recursive: stat.isDirectory() });
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to delete" }, 500);
  }
});

// Create directory
files.post("/:id/files/mkdir", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "/";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  try {
    mkdirSync(resolved.fsPath, { recursive: true });
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to create directory" }, 500);
  }
});

// ── Text config files ──────────────────────────────────────────────────────

/** Ficheros de texto que el editor de config sabe abrir. */
const CONFIG_EXTENSIONS = new Set([
  ".cfg",
  ".conf",
  ".ini",
  ".properties",
  ".toml",
  ".yml",
  ".yaml",
  ".json",
  ".xml",
]);

/** `.txt` es demasiado genérico: sólo dejamos pasar los que son config de verdad. */
const CONFIG_TXT_NAMES = new Set([
  "adminlist.txt",
  "bannedlist.txt",
  "permittedlist.txt",
  "ops.txt",
  "whitelist.txt",
  "banned-players.txt",
  "banned-ips.txt",
  "eula.txt",
]);

/** Nunca son config editable: instalaciones del juego, mundos, caches, backups. */
const SCAN_SKIP_DIRS = new Set([
  ".git",
  "backups",
  "cache",
  "crash-reports",
  "dl",
  "libraries",
  "logs",
  "mods",
  "node_modules",
  "resourcepacks",
  "saves",
  "server",
  "steamapps",
  "versions",
  "world",
  "world_nether",
  "world_the_end",
  "worlds_local",
]);

const SCAN_SKIP_FILES = new Set(["usercache.json", "usernamecache.json", "steam_appid.txt"]);

/** Un config de verdad no pesa megas; por encima de esto casi seguro es un dump. */
const CONFIG_MAX_BYTES = 512 * 1024;
/** Límite de lectura/escritura para el editor de texto. */
const TEXT_MAX_BYTES = 2 * 1024 * 1024;
const SCAN_MAX_DEPTH = 4;
const SCAN_MAX_RESULTS = 400;

function isConfigFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (SCAN_SKIP_FILES.has(lower)) return false;
  if (lower.endsWith(".txt")) return CONFIG_TXT_NAMES.has(lower);
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return CONFIG_EXTENSIONS.has(lower.slice(dot));
}

type ConfigCandidate = {
  /** Ruta tal y como la espera el resto de endpoints de /files */
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
};

/**
 * Recorre un volumen buscando ficheros de configuración editables.
 * Va acotado en profundidad, tamaño y número de resultados para que un volumen
 * con la instalación entera del juego dentro no tumbe la petición.
 */
function scanConfigs(
  fsDir: string,
  virtualDir: string,
  depth: number,
  out: ConfigCandidate[],
): void {
  if (depth > SCAN_MAX_DEPTH || out.length >= SCAN_MAX_RESULTS) return;

  let names: string[];
  try {
    names = readdirSync(fsDir);
  } catch {
    return;
  }

  for (const name of names) {
    if (out.length >= SCAN_MAX_RESULTS) return;
    if (name.startsWith(".")) continue;

    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(join(fsDir, name));
    } catch {
      continue;
    }

    if (s.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(name.toLowerCase())) continue;
      scanConfigs(join(fsDir, name), `${virtualDir}/${name}`, depth + 1, out);
      continue;
    }

    if (!isConfigFileName(name) || s.size > CONFIG_MAX_BYTES) continue;
    out.push({
      path: `${virtualDir}/${name}`,
      name,
      size: s.size,
      modifiedAt: Math.floor(s.mtimeMs / 1000),
    });
  }
}

// Discover editable config files across all volumes
files.get("/:id/files/configs", requireAuth, requireApproved, requireAdmin, (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const out: ConfigCandidate[] = [];
  for (const vol of volumes) {
    // Con un solo volumen las rutas cuelgan de su raíz; con varios llevan
    // delante el container path, igual que hace resolveSafePath.
    const virtualRoot = volumes.length === 1 ? "" : vol.containerPath.replace(/^\/+/, "");
    scanConfigs(vol.accessPath, virtualRoot, 0, out);
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return c.json(out);
});

// Read a text file
files.get("/:id/files/read", requireAuth, requireApproved, requireAdmin, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(resolved.fsPath);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
  if (stat.isDirectory()) return c.json({ error: "Not a file" }, 400);
  if (stat.size > TEXT_MAX_BYTES) return c.json({ error: "File too large to edit" }, 413);

  try {
    const content = await Bun.file(resolved.fsPath).text();
    return c.json({ path: requestedPath, content, size: stat.size });
  } catch {
    return c.json({ error: "Failed to read file" }, 500);
  }
});

// Write a text file
files.put("/:id/files/write", requireAuth, requireApproved, requireAdmin, async (c) => {
  const { id } = c.req.param();
  const server = serverQueries.getById.get(id);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const volumes = parseVolumes(server.volumes);
  if (volumes.length === 0) return c.json({ error: "No volumes configured" }, 400);

  const requestedPath = c.req.query("path") ?? "";
  const resolved = resolveSafePath(volumes, requestedPath);
  if (!resolved || resolved.isVirtualRoot) return c.json({ error: "Invalid path" }, 403);

  // Escribir sobre un directorio lo dejaría inservible.
  try {
    if (statSync(resolved.fsPath).isDirectory()) {
      return c.json({ error: "Not a file" }, 400);
    }
  } catch {
    // No existe todavía: lo creamos.
  }

  let content: string;
  try {
    const body = (await c.req.json()) as { content?: unknown };
    if (typeof body.content !== "string") {
      return c.json({ error: "Expected { content: string }" }, 400);
    }
    content = body.content;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (Buffer.byteLength(content, "utf8") > TEXT_MAX_BYTES) {
    return c.json({ error: "Content too large" }, 413);
  }

  try {
    mkdirSync(dirname(resolved.fsPath), { recursive: true });
    await Bun.write(resolved.fsPath, content);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to write file" }, 500);
  }
});

export default files;

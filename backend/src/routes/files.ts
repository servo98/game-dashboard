import { mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "fs";
import { Hono } from "hono";
import { join, resolve } from "path";
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
    const uploaded: string[] = [];

    for (const [_key, value] of formData.entries()) {
      if (typeof value === "string") continue;
      const file = value as unknown as File;

      // 100MB per file limit
      if (file.size > 100 * 1024 * 1024) {
        return c.json({ error: `File ${file.name} exceeds 100MB limit` }, 400);
      }

      const targetPath = join(resolved.fsPath, file.name);
      // Re-verify the target is still within bounds
      const safeTarget = resolve(targetPath);
      const vol = volumes.find((v) => safeTarget.startsWith(v.accessPath));
      if (!vol) return c.json({ error: `Invalid file name: ${file.name}` }, 403);

      const buffer = await file.arrayBuffer();
      await Bun.write(targetPath, buffer);
      uploaded.push(file.name);
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

export default files;

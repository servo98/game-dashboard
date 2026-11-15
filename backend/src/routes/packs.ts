import { readFileSync, realpathSync, statSync } from "fs";
import { Hono } from "hono";
import { join } from "path";
import { serverQueries } from "../db";

/**
 * Resource packs por servidor de Minecraft.
 *
 * GET /api/packs/:serverId/:file → /data/<serverId>/resourcepacks/<file>.zip
 *
 * Es PÚBLICA a propósito: el cliente de Minecraft descarga el pack que le
 * ofrece el servidor (server.properties → resource-pack) sin sesión ni
 * cabeceras. Por eso solo entrega .zip de la carpeta resourcepacks/ del volumen
 * /data de un servidor minecraft existente, y nada más.
 *
 * Cada servidor apunta a su pack con sus env vars (itzg):
 *   RESOURCE_PACK=https://game.aypapol.com/api/packs/<id>/<file>.zip
 *   RESOURCE_PACK_SHA1=<sha1>   RESOURCE_PACK_ENFORCE=TRUE
 */

const HOST_DATA_DIR = "/host-data";
const PACKS_SUBDIR = "resourcepacks";
// Límite de Minecraft para un pack de servidor (1.20.x): 250 MB.
const MAX_PACK_BYTES = 250 * 1024 * 1024;

const SERVER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.zip$/;

/** Carpeta resourcepacks/ del volumen montado en /data, vista desde el backend. */
function packsDir(volumesJson: string): string | null {
  const volumes = JSON.parse(volumesJson) as Record<string, string>;
  for (const [hostPath, containerPath] of Object.entries(volumes)) {
    if (containerPath === "/data" && hostPath.startsWith("/data/")) {
      return join(HOST_DATA_DIR, hostPath.slice("/data/".length), PACKS_SUBDIR);
    }
  }
  return null;
}

const packs = new Hono();

packs.get("/:serverId/:file", (c) => {
  const { serverId, file } = c.req.param();
  if (!SERVER_ID_RE.test(serverId) || !FILE_RE.test(file)) return c.notFound();

  // Por la imagen y no por game_type: hay servers de Minecraft dados de alta
  // con game_type "sandbox" (p. ej. el id "minecraft" en prod).
  const server = serverQueries.getById.get(serverId);
  if (!server || !server.docker_image.startsWith("itzg/minecraft-server")) return c.notFound();

  const dir = packsDir(server.volumes);
  if (!dir) return c.notFound();

  let realFile: string;
  try {
    // Un symlink dentro de resourcepacks/ no puede sacar archivos de ahí.
    const realDir = realpathSync(dir);
    realFile = realpathSync(join(dir, file));
    if (!realFile.startsWith(`${realDir}/`)) return c.notFound();
    const st = statSync(realFile);
    if (!st.isFile() || st.size > MAX_PACK_BYTES) return c.notFound();
  } catch {
    return c.notFound();
  }

  return c.body(readFileSync(realFile), 200, {
    "Content-Type": "application/zip",
    // El cliente cachea por SHA1; al cambiar el pack cambia el SHA1 (y el nombre).
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
});

export default packs;

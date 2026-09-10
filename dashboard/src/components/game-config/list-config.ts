/**
 * Ficheros de "una entrada por línea" con comentarios: los adminlist.txt /
 * bannedlist.txt / permittedlist.txt de Valheim, ops.txt, whitelist.txt…
 *
 *     // List admin players ID  ONE per line
 *     76561198000000000
 *
 * Los comentarios de cabecera se conservan tal cual; el usuario sólo toca la
 * lista de IDs.
 */

export type ParsedIdList = {
  /** Líneas de comentario que abren el fichero, sin tocar */
  header: string[];
  entries: string[];
  eol: string;
};

const COMMENT_PREFIXES = ["//", "#", ";"];

function isComment(line: string): boolean {
  const t = line.trim();
  return COMMENT_PREFIXES.some((p) => t.startsWith(p));
}

export function parseIdList(text: string): ParsedIdList {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);

  const header: string[] = [];
  const entries: string[] = [];
  let stillHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isComment(line)) {
      // Sólo son cabecera los comentarios de arriba del todo; los de en medio
      // se descartan al guardar (no hay dónde colgarlos sin inventar orden).
      if (stillHeader) header.push(line.trimEnd());
      continue;
    }
    if (trimmed === "") continue;
    stillHeader = false;
    entries.push(trimmed);
  }

  return { header, entries, eol };
}

export function serializeIdList(list: ParsedIdList, entries: string[]): string {
  const clean = entries.map((e) => e.trim()).filter(Boolean);
  const lines = [...list.header, ...clean];
  return lines.join(list.eol) + list.eol;
}

/** Un SteamID64 son 17 dígitos que empiezan por 7656119. */
export function looksLikeSteamId(value: string): boolean {
  return /^7656119\d{10}$/.test(value.trim());
}

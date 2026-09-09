/**
 * Deduce quién está conectado a un servidor de Valheim leyendo sus logs.
 *
 * A2S nos da el conteo pero devuelve los nombres vacíos, así que los sacamos de
 * aquí. Las tres líneas que importan:
 *
 *   Got connection SteamID 76561198071xxxxx       -> alguien entra
 *   Got character ZDOID from Jevus : 1519288260:1 -> nombre del personaje
 *   Closing socket 76561198071xxxxx               -> alguien sale
 *
 * El nombre no viene en la línea de conexión, así que se empareja por orden: el
 * primer "Got character ZDOID" tras una conexión pertenece a esa conexión. Es
 * heurístico, pero las dos líneas van seguidas en la práctica (segundos).
 *
 * Ojo: "Got character ZDOID from X : 0:0" también sale al morir, no solo al
 * salir, así que NO sirve como señal de desconexión; solo vale "Closing socket".
 */

const RE_CONNECT = /Got connection SteamID (\d+)/;
const RE_DISCONNECT = /Closing socket (\d+)/;
const RE_CHARACTER = /Got character ZDOID from (.+?) : -?\d+:-?\d+/;
/** Arranque del server: descarta cualquier estado previo del tail. */
const RE_BOOT = /Game server connected/;

export type ValheimPlayer = {
  steamId: string;
  /** null mientras no hayamos visto su línea de personaje */
  name: string | null;
};

/**
 * Reproduce un tail de logs y devuelve los jugadores conectados al final.
 * Función pura: mismas líneas, mismo resultado.
 */
export function parseConnectedPlayers(lines: string[]): ValheimPlayer[] {
  // Map mantiene orden de inserción, así que el orden de llegada se conserva.
  let connected = new Map<string, ValheimPlayer>();
  let pendingSteamId: string | null = null;

  for (const line of lines) {
    if (RE_BOOT.test(line)) {
      connected = new Map();
      pendingSteamId = null;
      continue;
    }

    const connect = line.match(RE_CONNECT);
    if (connect) {
      const steamId = connect[1];
      if (!connected.has(steamId)) connected.set(steamId, { steamId, name: null });
      pendingSteamId = steamId;
      continue;
    }

    const disconnect = line.match(RE_DISCONNECT);
    if (disconnect) {
      connected.delete(disconnect[1]);
      if (pendingSteamId === disconnect[1]) pendingSteamId = null;
      continue;
    }

    const character = line.match(RE_CHARACTER);
    if (character) {
      const name = character[1].trim();
      if (!name) continue;
      // Ya atribuido a alguien conectado: es una reaparición, no un jugador nuevo.
      const alreadyKnown = [...connected.values()].some((p) => p.name === name);
      if (alreadyKnown) continue;

      const target =
        (pendingSteamId ? connected.get(pendingSteamId) : undefined) ??
        [...connected.values()].find((p) => p.name === null);
      if (target && target.name === null) {
        target.name = name;
        if (target.steamId === pendingSteamId) pendingSteamId = null;
      }
    }
  }

  return [...connected.values()];
}

/** Solo los nombres conocidos, para pintar en el dashboard. */
export function connectedNames(players: ValheimPlayer[]): string[] {
  return players.map((p) => p.name).filter((n): n is string => n !== null);
}

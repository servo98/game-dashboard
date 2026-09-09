import { getContainerLogTail } from "../../docker";
import { queryA2SInfo } from "./a2s";
import { connectedNames, parseConnectedPlayers } from "./log-players";

/**
 * Adapter de Valheim para la lista de jugadores.
 *
 * Valheim no tiene RCON (a diferencia de Minecraft), así que combinamos dos
 * fuentes:
 *   - A2S_INFO en el puerto de query (gamePort + 1) -> conteo fiable.
 *   - Los logs del contenedor -> nombres de los personajes, que A2S devuelve
 *     vacíos.
 *
 * Si A2S no contesta (server arrancando, o query port cerrado) caemos al
 * conteo deducido de los logs, que es peor pero no deja la UI en blanco.
 */

/**
 * Host donde escucha el juego. El contenedor de Valheim usa red host, y el
 * backend vive en la red bridge del compose, así que hay que salir por la
 * gateway: docker-compose mapea `host.docker.internal` a `host-gateway`.
 */
const VALHEIM_QUERY_HOST = process.env.VALHEIM_QUERY_HOST ?? "host.docker.internal";

/** Cuántas líneas de log rebobinamos para reconstruir quién está dentro. */
const LOG_TAIL_LINES = 5000;

export type ValheimPlayersResult = {
  online: string[];
  count: number;
  max: number;
};

export async function getValheimPlayers(
  serverId: string,
  gamePort: number,
): Promise<ValheimPlayersResult> {
  const lines = await getContainerLogTail(serverId, LOG_TAIL_LINES);
  const players = parseConnectedPlayers(lines);
  const online = connectedNames(players);

  try {
    const info = await queryA2SInfo(VALHEIM_QUERY_HOST, gamePort + 1);
    return { online, count: info.players, max: info.maxPlayers };
  } catch {
    // A2S mudo: nos quedamos con lo que digan los logs.
    return { online, count: players.length, max: 0 };
  }
}

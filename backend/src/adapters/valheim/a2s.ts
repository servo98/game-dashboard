import { createSocket } from "dgram";

/**
 * Cliente mínimo del protocolo A2S (Steam server query).
 *
 * Valheim escucha el puerto de query en gamePort + 1 (2457 por defecto) y
 * responde A2S_INFO con el conteo de jugadores. Ojo: responde también a
 * A2S_PLAYER, pero devuelve los nombres vacíos, así que para saber QUIÉN está
 * dentro hay que tirar de los logs (ver log-players.ts).
 */

const A2S_INFO_PAYLOAD = Buffer.concat([
  Buffer.from([0xff, 0xff, 0xff, 0xff]),
  Buffer.from("TSource Engine Query\0", "latin1"),
]);

export type A2SInfo = {
  name: string;
  players: number;
  maxPlayers: number;
};

/** Envía un datagrama y espera una única respuesta, con timeout. */
function sendAndReceive(host: string, port: number, payload: Buffer, timeoutMs: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const sock = createSocket("udp4");
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error(`A2S timeout tras ${timeoutMs}ms`));
    }, timeoutMs);

    const done = (err: Error | null, data?: Buffer) => {
      clearTimeout(timer);
      try {
        sock.close();
      } catch {}
      if (err) reject(err);
      else resolve(data as Buffer);
    };

    sock.once("message", (msg) => done(null, msg));
    sock.once("error", (err) => done(err));
    sock.send(payload, port, host, (err) => {
      if (err) done(err);
    });
  });
}

/** Lee una cadena terminada en NUL a partir de `offset`. */
function readCString(buf: Buffer, offset: number): [string, number] {
  const end = buf.indexOf(0, offset);
  if (end === -1) throw new Error("A2S: cadena sin terminador");
  return [buf.toString("utf8", offset, end), end + 1];
}

export function parseA2SInfo(buf: Buffer): A2SInfo {
  if (buf.length < 6 || buf.readUInt8(4) !== 0x49) {
    throw new Error("A2S: respuesta no es A2S_INFO");
  }
  // Tras la cabecera (4 bytes) van el tipo (I) y la versión de protocolo.
  const [name, afterName] = readCString(buf, 6);
  const [, afterMap] = readCString(buf, afterName);
  const [, afterFolder] = readCString(buf, afterMap);
  const [, afterGame] = readCString(buf, afterFolder);
  const i = afterGame + 2; // saltamos el appid (int16 LE)
  return { name, players: buf.readUInt8(i), maxPlayers: buf.readUInt8(i + 1) };
}

/**
 * Consulta A2S_INFO. Maneja el challenge (0x41) que Valve introdujo en 2020:
 * el server responde con un token que hay que reenviar con la petición.
 */
export async function queryA2SInfo(host: string, port: number, timeoutMs = 3000): Promise<A2SInfo> {
  let res = await sendAndReceive(host, port, A2S_INFO_PAYLOAD, timeoutMs);
  if (res.readUInt8(4) === 0x41) {
    const challenge = res.subarray(5, 9);
    res = await sendAndReceive(host, port, Buffer.concat([A2S_INFO_PAYLOAD, challenge]), timeoutMs);
  }
  return parseA2SInfo(res);
}

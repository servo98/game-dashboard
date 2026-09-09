import { describe, expect, it } from "vitest";
import { parseA2SInfo } from "./a2s";

/** Construye una respuesta A2S_INFO con el layout que devuelve Valheim. */
function buildInfoResponse(opts: {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
}): Buffer {
  const str = (s: string) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
  return Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from([0x49]), // 'I' = A2S_INFO
    Buffer.from([0x11]), // versión de protocolo
    str(opts.name),
    str(opts.map),
    str("valheim"), // folder
    str(""), // game (Valheim lo manda vacío)
    Buffer.from([0x00, 0x00]), // appid int16 LE
    Buffer.from([opts.players, opts.maxPlayers, 0x00]), // players, max, bots
  ]);
}

describe("parseA2SInfo", () => {
  it("lee el conteo de jugadores de una respuesta real", () => {
    const buf = buildInfoResponse({
      name: "Valheim Server",
      map: "Valheim Server",
      players: 3,
      maxPlayers: 10,
    });
    expect(parseA2SInfo(buf)).toEqual({
      name: "Valheim Server",
      players: 3,
      maxPlayers: 10,
    });
  });

  it("lee un server vacío", () => {
    const buf = buildInfoResponse({ name: "Vacio", map: "Vacio", players: 0, maxPlayers: 10 });
    expect(parseA2SInfo(buf)).toMatchObject({ players: 0, maxPlayers: 10 });
  });

  it("soporta nombres con acentos", () => {
    const buf = buildInfoResponse({ name: "Vikingós", map: "m", players: 1, maxPlayers: 10 });
    expect(parseA2SInfo(buf).name).toBe("Vikingós");
  });

  it("rechaza una respuesta que no es A2S_INFO", () => {
    // 'A' = challenge, no info
    const challenge = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 1, 2, 3, 4]);
    expect(() => parseA2SInfo(challenge)).toThrow(/no es A2S_INFO/);
  });

  it("rechaza un buffer truncado", () => {
    expect(() => parseA2SInfo(Buffer.from([0xff, 0xff]))).toThrow();
  });
});

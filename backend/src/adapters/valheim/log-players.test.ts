import { describe, expect, it } from "vitest";
import { connectedNames, parseConnectedPlayers } from "./log-players";

// Líneas reales del server (SteamIDs recortados).
const CONNECT = (id: string) => `09/09/2026 16:55:15: Got connection SteamID ${id}`;
const CHARACTER = (name: string) =>
  `09/09/2026 16:55:33: Got character ZDOID from ${name} : 1519288260:1`;
const CLOSE = (id: string) => `09/09/2026 16:56:38: Closing socket ${id}`;
const BOOT = "09/09/2026 16:53:55: Game server connected";

describe("parseConnectedPlayers", () => {
  it("empareja una conexión con el nombre de su personaje", () => {
    const players = parseConnectedPlayers([CONNECT("111"), CHARACTER("Jevus")]);
    expect(players).toEqual([{ steamId: "111", name: "Jevus" }]);
  });

  it("mantiene el orden de llegada con varios jugadores", () => {
    const players = parseConnectedPlayers([
      CONNECT("111"),
      CHARACTER("Jevus"),
      CONNECT("222"),
      CHARACTER("Chuchin"),
      CONNECT("333"),
      CHARACTER("Hijodepapol"),
    ]);
    expect(connectedNames(players)).toEqual(["Jevus", "Chuchin", "Hijodepapol"]);
  });

  it("quita al jugador cuando se cierra su socket", () => {
    const players = parseConnectedPlayers([
      CONNECT("111"),
      CHARACTER("Jevus"),
      CONNECT("222"),
      CHARACTER("Chuchin"),
      CLOSE("111"),
    ]);
    expect(connectedNames(players)).toEqual(["Chuchin"]);
  });

  it("no duplica al jugador que muere y reaparece", () => {
    // Al morir sale un ZDOID 0:0 y luego otro al reaparecer: sigue siendo uno.
    const players = parseConnectedPlayers([
      CONNECT("111"),
      CHARACTER("Jevus"),
      "09/09/2026 16:55:40: Got character ZDOID from Jevus : 0:0",
      CHARACTER("Jevus"),
    ]);
    expect(players).toHaveLength(1);
    expect(connectedNames(players)).toEqual(["Jevus"]);
  });

  it("descarta el estado anterior al reiniciar el server", () => {
    const players = parseConnectedPlayers([
      CONNECT("111"),
      CHARACTER("Jevus"),
      BOOT,
      CONNECT("222"),
      CHARACTER("Chuchin"),
    ]);
    expect(connectedNames(players)).toEqual(["Chuchin"]);
  });

  it("cuenta al jugador conectado aunque aún no sepamos su nombre", () => {
    const players = parseConnectedPlayers([CONNECT("111")]);
    expect(players).toEqual([{ steamId: "111", name: null }]);
    expect(connectedNames(players)).toEqual([]);
  });

  it("sobrevive a una reconexión rápida del mismo SteamID", () => {
    const players = parseConnectedPlayers([
      CONNECT("222"),
      CLOSE("222"),
      CONNECT("222"),
      CHARACTER("Chuchin"),
    ]);
    expect(connectedNames(players)).toEqual(["Chuchin"]);
  });

  it("ignora líneas de ruido", () => {
    const players = parseConnectedPlayers([
      "09/09/2026 16:52:02: Steam game server initialized",
      "Could not find video decode shader pass Default in shader <not found>",
      "NullReferenceException: The WorldGenerator instance was null",
    ]);
    expect(players).toEqual([]);
  });

  it("devuelve vacío sin logs", () => {
    expect(parseConnectedPlayers([])).toEqual([]);
  });
});

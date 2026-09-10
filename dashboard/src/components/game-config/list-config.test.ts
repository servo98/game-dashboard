import { describe, expect, it } from "vitest";
import { looksLikeSteamId, parseIdList, serializeIdList } from "./list-config";

const ADMINLIST = `// List admin players ID  ONE per line
76561198000000001
76561198000000002
`;

describe("parseIdList", () => {
  it("separa la cabecera de las entradas", () => {
    const parsed = parseIdList(ADMINLIST);
    expect(parsed.header).toEqual(["// List admin players ID  ONE per line"]);
    expect(parsed.entries).toEqual(["76561198000000001", "76561198000000002"]);
  });

  it("ignora líneas en blanco y recorta espacios", () => {
    const parsed = parseIdList("// cabecera\n\n  76561198000000001  \n\n");
    expect(parsed.entries).toEqual(["76561198000000001"]);
  });

  it("un fichero sólo con comentarios deja la lista vacía", () => {
    expect(parseIdList(ADMINLIST.split("\n")[0]).entries).toEqual([]);
  });
});

describe("serializeIdList", () => {
  it("conserva la cabecera al reescribir", () => {
    const parsed = parseIdList(ADMINLIST);
    const out = serializeIdList(parsed, ["76561198000000003"]);
    expect(out).toBe("// List admin players ID  ONE per line\n76561198000000003\n");
  });

  it("descarta entradas vacías", () => {
    const parsed = parseIdList(ADMINLIST);
    expect(
      serializeIdList(parsed, ["", "  ", "76561198000000009"]).trim().split("\n"),
    ).toHaveLength(2);
  });

  it("round-trip sin cambios devuelve lo mismo", () => {
    const parsed = parseIdList(ADMINLIST);
    expect(serializeIdList(parsed, parsed.entries)).toBe(ADMINLIST);
  });
});

describe("looksLikeSteamId", () => {
  it("acepta un SteamID64 válido", () => {
    expect(looksLikeSteamId("76561198000000001")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(looksLikeSteamId("12345")).toBe(false);
    expect(looksLikeSteamId("765611980000000012")).toBe(false);
    expect(looksLikeSteamId("Rubas")).toBe(false);
  });
});

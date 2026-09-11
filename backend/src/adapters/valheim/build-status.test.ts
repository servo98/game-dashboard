import { describe, expect, it } from "vitest";
import { manifestPathFor, parseAppManifest } from "./build-status";

/** Un appmanifest con la forma exacta que escribe steamcmd. */
function buildManifest(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `\t"${k}"\t\t"${v}"`);
  return [
    '"AppState"',
    "{",
    '\t"appid"\t\t"896660"',
    '\t"name"\t\t"Valheim Dedicated Server"',
    ...lines,
    '\t"InstalledDepots"',
    "\t{",
    '\t\t"896661"',
    "\t\t{",
    // Ojo: aquí hay un "manifest" y un "size" que no deben confundir al parser.
    '\t\t\t"manifest"\t\t"6242541463332331733"',
    '\t\t\t"size"\t\t"2028553618"',
    "\t\t}",
    "\t}",
    "}",
  ].join("\n");
}

describe("parseAppManifest", () => {
  it("da por actualizado un manifest sano", () => {
    const status = parseAppManifest(
      buildManifest({
        StateFlags: "4",
        buildid: "25253791",
        TargetBuildID: "25253791",
        UpdateResult: "0",
        LastUpdated: "1789158600",
      }),
    );

    expect(status.state).toBe("up-to-date");
    expect(status.installedBuild).toBe("25253791");
    expect(status.lastUpdated).toBe(1789158600);
  });

  it("detecta que Steam ofrece una build más nueva", () => {
    const status = parseAppManifest(
      buildManifest({
        StateFlags: "6",
        buildid: "25185644",
        TargetBuildID: "25253791",
        UpdateResult: "0",
      }),
    );

    expect(status.state).toBe("update-pending");
    expect(status.installedBuild).toBe("25185644");
    expect(status.targetBuild).toBe("25253791");
  });

  it("detecta el update atascado que deja steamcmd tras fallar", () => {
    // Este es el manifest real que dejó el fallo del 11/09/2026: el server se
    // quedó en 1.0.7 mientras los clientes ya iban por 1.0.12.
    const status = parseAppManifest(
      buildManifest({
        StateFlags: "6",
        buildid: "25185644",
        TargetBuildID: "25253791",
        UpdateResult: "6",
      }),
    );

    expect(status.state).toBe("update-failed");
  });

  it("marca como fallido aunque las builds coincidan: steamcmd no reintenta solo", () => {
    const status = parseAppManifest(
      buildManifest({
        StateFlags: "6",
        buildid: "25253791",
        TargetBuildID: "25253791",
        UpdateResult: "2",
      }),
    );

    expect(status.state).toBe("update-failed");
  });

  it("no se inventa nada con un manifest ilegible", () => {
    expect(parseAppManifest("").state).toBe("unknown");
    expect(parseAppManifest("basura").installedBuild).toBeNull();
  });
});

describe("manifestPathFor", () => {
  it("traduce el volumen del host a la ruta que ve el backend", () => {
    expect(
      manifestPathFor({ "/data/valheim/config": "/config", "/data/valheim/data": "/opt/valheim" }),
    ).toBe("/host-data/valheim/data/dl/server/steamapps/appmanifest_896660.acf");
  });

  it("devuelve null si el server no monta /opt/valheim", () => {
    expect(manifestPathFor({ "/data/valheim/config": "/config" })).toBeNull();
  });

  it("ignora volúmenes fuera de /data, que el backend no puede leer", () => {
    expect(manifestPathFor({ "/srv/valheim": "/opt/valheim" })).toBeNull();
  });
});

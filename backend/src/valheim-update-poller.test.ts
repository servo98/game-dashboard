import { describe, expect, it } from "vitest";
import type { ValheimBuildStatus } from "./adapters/valheim/build-status";
import { PENDING_GRACE_MS, shouldWarn } from "./valheim-update-poller";

function status(state: ValheimBuildStatus["state"]): ValheimBuildStatus {
  return { state, installedBuild: "25185644", targetBuild: "25253791", lastUpdated: null };
}

describe("shouldWarn", () => {
  const now = 1_800_000_000_000;

  it("avisa al momento de un update fallido: steamcmd no reintenta solo", () => {
    expect(shouldWarn(status("update-failed"), now, now)).toBe(true);
  });

  it("calla ante una versión recién publicada, que el contenedor instalará solo", () => {
    expect(shouldWarn(status("update-pending"), now - 5 * 60_000, now)).toBe(false);
  });

  it("avisa si la versión pendiente sigue sin instalarse pasado el margen", () => {
    expect(shouldWarn(status("update-pending"), now - PENDING_GRACE_MS - 1, now)).toBe(true);
  });

  it("no avisa de lo que está al día ni de lo que no puede leer", () => {
    expect(shouldWarn(status("up-to-date"), now - 10 * 60 * 60_000, now)).toBe(false);
    expect(shouldWarn(status("unknown"), now - 10 * 60 * 60_000, now)).toBe(false);
  });
});

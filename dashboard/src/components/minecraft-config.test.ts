import { describe, expect, it } from "vitest";
import {
  getAllKnownKeys,
  getModpackEnvKeys,
  getModpackPlatformByType,
  isModpackType,
  MINECRAFT_FIELDS,
  MODPACK_PLATFORMS,
} from "./minecraft-config";

describe("isModpackType", () => {
  it("returns true for MODRINTH", () => {
    expect(isModpackType("MODRINTH")).toBe(true);
  });

  it("returns true for AUTO_CURSEFORGE", () => {
    expect(isModpackType("AUTO_CURSEFORGE")).toBe(true);
  });

  it("returns true for FTBA", () => {
    expect(isModpackType("FTBA")).toBe(true);
  });

  it("returns false for VANILLA", () => {
    expect(isModpackType("VANILLA")).toBe(false);
  });

  it("returns false for PAPER", () => {
    expect(isModpackType("PAPER")).toBe(false);
  });
});

describe("getModpackPlatformByType", () => {
  it("returns modrinth platform for MODRINTH", () => {
    const platform = getModpackPlatformByType("MODRINTH");
    expect(platform).toBeDefined();
    expect(platform!.id).toBe("modrinth");
  });

  it("returns curseforge platform for AUTO_CURSEFORGE", () => {
    const platform = getModpackPlatformByType("AUTO_CURSEFORGE");
    expect(platform).toBeDefined();
    expect(platform!.id).toBe("curseforge");
  });

  it("returns undefined for non-modpack type", () => {
    expect(getModpackPlatformByType("VANILLA")).toBeUndefined();
  });
});

describe("getModpackEnvKeys", () => {
  it("returns all modpack-related env keys", () => {
    const keys = getModpackEnvKeys();
    expect(keys).toContain("MODRINTH_MODPACK");
    expect(keys).toContain("CF_SLUG");
    expect(keys).toContain("FTB_MODPACK_ID");
  });

  it("does not include standard Minecraft keys", () => {
    const keys = getModpackEnvKeys();
    expect(keys).not.toContain("TYPE");
    expect(keys).not.toContain("MEMORY");
  });
});

describe("getAllKnownKeys", () => {
  it("includes EULA", () => {
    expect(getAllKnownKeys().has("EULA")).toBe(true);
  });

  it("includes all MINECRAFT_FIELDS keys", () => {
    const known = getAllKnownKeys();
    for (const field of MINECRAFT_FIELDS) {
      expect(known.has(field.key)).toBe(true);
    }
  });

  it("includes all modpack platform field keys", () => {
    const known = getAllKnownKeys();
    for (const platform of MODPACK_PLATFORMS) {
      for (const field of platform.fields) {
        expect(known.has(field.key)).toBe(true);
      }
    }
  });
});

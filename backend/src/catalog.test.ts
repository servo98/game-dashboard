import { describe, expect, it } from "vitest";
import { findTemplate, GAME_CATALOG } from "./catalog";

describe("findTemplate", () => {
  it("returns the template for a known id", () => {
    const mc = findTemplate("minecraft");
    expect(mc).toBeDefined();
    expect(mc!.name).toBe("Minecraft");
    expect(mc!.docker_image).toBe("itzg/minecraft-server:latest");
  });

  it("returns undefined for an unknown id", () => {
    expect(findTemplate("nonexistent")).toBeUndefined();
  });
});

describe("GAME_CATALOG integrity", () => {
  it("has no duplicate IDs", () => {
    const ids = GAME_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template has required fields", () => {
    for (const t of GAME_CATALOG) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.docker_image).toBeTruthy();
      expect(t.default_port).toBeGreaterThan(0);
      expect(t.default_volumes).toBeDefined();
    }
  });

  it("every template has at least one volume", () => {
    for (const t of GAME_CATALOG) {
      expect(Object.keys(t.default_volumes).length).toBeGreaterThanOrEqual(1);
    }
  });
});

import { join } from "path";
import { describe, expect, it } from "vitest";
import { backupDir, timestamp } from "./backup";

describe("timestamp", () => {
  it("returns YYYY-MM-DD_HH-MM-SS format", () => {
    const ts = timestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  it("uses current date", () => {
    const ts = timestamp();
    const year = new Date().getFullYear().toString();
    expect(ts.startsWith(year)).toBe(true);
  });
});

describe("backupDir", () => {
  it("returns BACKUP_DIR/serverId using path.join", () => {
    // path.join uses OS-specific separators, so we match against that
    expect(backupDir("minecraft")).toBe(join("/data/backups", "minecraft"));
  });

  it("works with different server IDs", () => {
    expect(backupDir("valheim")).toBe(join("/data/backups", "valheim"));
    expect(backupDir("cs2server")).toBe(join("/data/backups", "cs2server"));
  });
});

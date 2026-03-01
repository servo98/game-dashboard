import { describe, expect, it } from "vitest";
import { formatLogLine, gameContainerName, stripAnsi } from "./docker";

describe("gameContainerName", () => {
  it("prefixes with game-panel-", () => {
    expect(gameContainerName("minecraft")).toBe("game-panel-minecraft");
  });

  it("works with different server IDs", () => {
    expect(gameContainerName("valheim")).toBe("game-panel-valheim");
    expect(gameContainerName("cs2server")).toBe("game-panel-cs2server");
  });
});

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    expect(stripAnsi("\x1b[32mHello\x1b[0m")).toBe("Hello");
  });

  it("removes multiple ANSI sequences", () => {
    expect(stripAnsi("\x1b[1;31mError:\x1b[0m \x1b[33mwarning\x1b[0m")).toBe("Error: warning");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("No colors here")).toBe("No colors here");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

describe("formatLogLine", () => {
  it("compresses ISO timestamp to short format", () => {
    const result = formatLogLine("2026-02-28T14:30:45.123456Z Server started");
    expect(result).toBe("2026-02-28T14:30:45Z\tServer started");
  });

  it("strips ANSI codes from output", () => {
    const result = formatLogLine("\x1b[32m2026-02-28T14:30:45.123Z\x1b[0m Hello");
    expect(result).toBe("2026-02-28T14:30:45Z\tHello");
  });

  it("returns non-timestamped lines as-is (after stripping ANSI)", () => {
    const result = formatLogLine("Just a regular log line");
    expect(result).toBe("Just a regular log line");
  });

  it("returns ANSI-stripped line when no timestamp match", () => {
    const result = formatLogLine("\x1b[31mError occurred\x1b[0m");
    expect(result).toBe("Error occurred");
  });
});

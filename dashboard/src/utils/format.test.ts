import { describe, expect, it } from "vitest";
import { connectAddress, formatDuration, formatLine, formatSize } from "./format";

describe("connectAddress", () => {
  it("returns mc.domain for port 25565", () => {
    expect(connectAddress(25565, "aypapol.com")).toBe("mc.aypapol.com");
  });

  it("returns rolcito.domain for port 30000", () => {
    expect(connectAddress(30000, "aypapol.com")).toBe("rolcito.aypapol.com");
  });

  it("returns desglosador3000.domain for port 8080", () => {
    expect(connectAddress(8080, "aypapol.com")).toBe("desglosador3000.aypapol.com");
  });

  it("returns domain:port for unmapped ports", () => {
    expect(connectAddress(27015, "aypapol.com")).toBe("aypapol.com:27015");
  });

  it("keeps game-client types without scheme", () => {
    expect(connectAddress(25565, "aypapol.com", "sandbox")).toBe("mc.aypapol.com");
    expect(connectAddress(2456, "aypapol.com", "survival")).toBe("aypapol.com:2456");
  });

  it("prefixes https:// for anything opened in a browser", () => {
    expect(connectAddress(3400, "aypapol.com", "tools")).toBe("https://aypapol.com:3400");
    expect(connectAddress(8787, "aypapol.com", "other")).toBe("https://aypapol.com:8787");
    expect(connectAddress(30000, "aypapol.com", "tabletop")).toBe("https://rolcito.aypapol.com");
    expect(connectAddress(8080, "aypapol.com", "tools")).toBe(
      "https://desglosador3000.aypapol.com",
    );
  });
});

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });

  it("handles exact minute boundary", () => {
    expect(formatDuration(60)).toBe("1m 0s");
  });

  it("handles exact hour boundary", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("formatSize", () => {
  it("formats bytes to KB", () => {
    expect(formatSize(512 * 1024)).toBe("512 KB");
  });

  it("formats bytes to MB", () => {
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats bytes to GB", () => {
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });

  it("formats small values", () => {
    expect(formatSize(1024)).toBe("1 KB");
  });
});

describe("formatLine", () => {
  it("converts ISO timestamp tab-separated to local time format", () => {
    const result = formatLine("2026-02-28T14:30:45Z\tServer started");
    // Locale may include AM/PM markers, so just check the general structure
    expect(result).toMatch(/^\[.+\] Server started$/);
    expect(result).not.toContain("\t");
  });

  it("returns non-timestamped lines unchanged", () => {
    expect(formatLine("Just a regular log line")).toBe("Just a regular log line");
  });

  it("returns lines without tab unchanged", () => {
    expect(formatLine("2026-02-28T14:30:45Z no tab")).toBe("2026-02-28T14:30:45Z no tab");
  });

  it("returns lines with invalid date unchanged", () => {
    expect(formatLine("not-a-date\tsome message")).toBe("not-a-date\tsome message");
  });
});

import { describe, expect, it, vi } from "vitest";

// Mock docker before importing the module
vi.mock("./docker", () => ({
  streamContainerLogs: vi.fn(),
}));

import {
  clearJoinable,
  getJoinableStatus,
  isJoinableLine,
  setStarting,
  stopJoinableWatcher,
} from "./joinable-status";

describe("joinable-status", () => {
  it("isJoinableLine matches vanilla Done pattern", () => {
    expect(isJoinableLine('Done (25.3s)! For help, type "help"')).toBe(true);
  });

  it("isJoinableLine matches comma decimal locale", () => {
    expect(isJoinableLine('Done (25,3s)! For help, type "help"')).toBe(true);
  });

  it("isJoinableLine rejects 'Done loading X mods'", () => {
    expect(isJoinableLine("Done loading 142 mods")).toBe(false);
  });

  it("isJoinableLine rejects generic 'Done' lines", () => {
    expect(isJoinableLine("Done preparing spawn area")).toBe(false);
  });

  it("setStarting → status is 'starting'", () => {
    setStarting("test-server");
    expect(getJoinableStatus("test-server")).toBe("starting");
    // cleanup
    clearJoinable("test-server");
  });

  it("clearJoinable → status is null", () => {
    setStarting("test-server");
    clearJoinable("test-server");
    expect(getJoinableStatus("test-server")).toBeNull();
  });

  it("stopJoinableWatcher clears status", () => {
    setStarting("test-server");
    stopJoinableWatcher("test-server");
    expect(getJoinableStatus("test-server")).toBeNull();
  });

  it("getJoinableStatus returns null for unknown server", () => {
    expect(getJoinableStatus("unknown-server")).toBeNull();
  });
});

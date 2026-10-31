import { describe, expect, it } from "vitest";
import { connectAddress } from "./ip";

describe("connectAddress", () => {
  it("returns mc.domain for sandbox on port 25565", () => {
    expect(connectAddress("sandbox", 25565, "aypapol.com")).toBe("mc.aypapol.com");
  });

  it("returns domain:port for game-client types", () => {
    expect(connectAddress("survival", 2456, "aypapol.com")).toBe("aypapol.com:2456");
  });

  it("prefixes https:// for web apps", () => {
    expect(connectAddress("tools", 3400, "aypapol.com")).toBe("https://aypapol.com:3400");
    expect(connectAddress("other", 8787, "aypapol.com")).toBe("https://aypapol.com:8787");
  });

  it("returns domain:port for sandbox on non-standard port", () => {
    expect(connectAddress("sandbox", 19132, "example.com")).toBe("example.com:19132");
  });

  it("works with custom domains", () => {
    expect(connectAddress("sandbox", 25565, "custom.net")).toBe("mc.custom.net");
  });
});

import { describe, expect, it } from "vitest";
import { connectAddress } from "./ip";

describe("connectAddress", () => {
  it("returns mc.domain for sandbox on port 25565", () => {
    expect(connectAddress("sandbox", 25565, "aypapol.com")).toBe("mc.aypapol.com");
  });

  it("returns domain:port for non-sandbox game types", () => {
    expect(connectAddress("fps", 27015, "aypapol.com")).toBe("aypapol.com:27015");
  });

  it("returns domain:port for sandbox on non-standard port", () => {
    expect(connectAddress("sandbox", 19132, "example.com")).toBe("example.com:19132");
  });

  it("works with custom domains", () => {
    expect(connectAddress("sandbox", 25565, "custom.net")).toBe("mc.custom.net");
  });
});

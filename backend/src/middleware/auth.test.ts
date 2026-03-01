import { describe, expect, it } from "vitest";
import { getCookie } from "./auth";

describe("getCookie", () => {
  it("extracts a cookie value from the header", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "session=abc123; theme=dark" },
    });
    expect(getCookie(req, "session")).toBe("abc123");
  });

  it("extracts the last cookie in the string", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "a=1; b=2; target=hello" },
    });
    expect(getCookie(req, "target")).toBe("hello");
  });

  it("returns undefined when cookie is not present", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "other=value" },
    });
    expect(getCookie(req, "session")).toBeUndefined();
  });

  it("returns undefined when no cookie header exists", () => {
    const req = new Request("http://localhost");
    expect(getCookie(req, "session")).toBeUndefined();
  });

  it("handles cookie with empty value", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "session=" },
    });
    expect(getCookie(req, "session")).toBe("");
  });
});

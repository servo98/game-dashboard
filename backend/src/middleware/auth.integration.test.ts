import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth, requireBotKey } from "./auth";

// Mock db module — sessionQueries.get.get controls auth
vi.mock("../db", () => {
  const get = vi.fn();
  return {
    db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
    sessionQueries: {
      get: { get },
      insert: { run: vi.fn() },
      delete: { run: vi.fn() },
      cleanup: { run: vi.fn() },
    },
    serverQueries: {
      getAll: { all: vi.fn(() => []) },
      getById: { get: vi.fn() },
      insert: { run: vi.fn() },
      deleteById: { run: vi.fn() },
      update: { run: vi.fn() },
      updateTheme: { run: vi.fn() },
    },
    serverSessionQueries: {
      start: { run: vi.fn() },
      stop: { run: vi.fn() },
      history: { all: vi.fn(() => []) },
      deleteByServerId: { run: vi.fn() },
    },
    backupQueries: {
      listAll: { all: vi.fn(() => []) },
      list: { all: vi.fn(() => []) },
      insert: { run: vi.fn() },
      getById: { get: vi.fn() },
      deleteById: { run: vi.fn() },
      count: { get: vi.fn() },
      oldest: { get: vi.fn() },
    },
    botSettingsQueries: { get: { get: vi.fn() }, set: { run: vi.fn() }, unset: { run: vi.fn() } },
    panelSettingsQueries: {
      get: { get: vi.fn() },
      set: { run: vi.fn() },
      getAll: { all: vi.fn(() => []) },
    },
    getPanelSetting: vi.fn(() => "6"),
    getAllPanelSettings: vi.fn(() => ({})),
  };
});

const { sessionQueries } = await import("../db");

function buildApp() {
  const app = new Hono();
  app.get("/auth-only", requireAuth, (c) => c.json({ ok: true }));
  app.get("/bot-only", requireBotKey, (c) => c.json({ ok: true }));
  return app;
}

describe("requireAuth middleware", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("returns 401 without cookie or Authorization header", async () => {
    const res = await app.request("/auth-only");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid session token", async () => {
    (sessionQueries.get.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const res = await app.request("/auth-only", {
      headers: { cookie: "session=bad-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid session cookie", async () => {
    (sessionQueries.get.get as ReturnType<typeof vi.fn>).mockReturnValue({
      token: "good",
      discord_id: "1",
      username: "u",
      avatar: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request("/auth-only", {
      headers: { cookie: "session=good" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 with valid Bearer token", async () => {
    (sessionQueries.get.get as ReturnType<typeof vi.fn>).mockReturnValue({
      token: "bearer-tok",
      discord_id: "1",
      username: "u",
      avatar: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request("/auth-only", {
      headers: { Authorization: "Bearer bearer-tok" },
    });
    expect(res.status).toBe(200);
  });
});

describe("requireBotKey middleware", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_KEY = "test-bot-key";
    app = buildApp();
  });

  it("returns 403 without X-Bot-Api-Key", async () => {
    const res = await app.request("/bot-only");
    expect(res.status).toBe(403);
  });

  it("returns 403 with wrong key", async () => {
    const res = await app.request("/bot-only", {
      headers: { "X-Bot-Api-Key": "wrong-key" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 200 with correct X-Bot-Api-Key", async () => {
    const res = await app.request("/bot-only", {
      headers: { "X-Bot-Api-Key": "test-bot-key" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

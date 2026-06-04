import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServer } from "../__tests__/factories";

// ─── Mock db ────────────────────────────────────────────────────────────────
const mockSessionGet = vi.fn();
const mockTokenGetByToken = vi.fn();
const mockServerGetAll = vi.fn();
const mockServerGetById = vi.fn();
const mockPanelUserGet = vi.fn();

vi.mock("../db", () => ({
  db: { exec: vi.fn(), query: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
  sessionQueries: { get: { get: mockSessionGet } },
  panelUserQueries: { get: { get: mockPanelUserGet } },
  mcpTokenQueries: {
    getByToken: { get: mockTokenGetByToken },
    updateLastUsed: { run: vi.fn() },
  },
  serverQueries: {
    getAll: { all: mockServerGetAll },
    getById: { get: mockServerGetById },
  },
}));

// ─── Mock docker ────────────────────────────────────────────────────────────
const mockGetRunningGameServers = vi.fn().mockResolvedValue([]);
const mockGetContainerStatus = vi.fn().mockResolvedValue("running" as const);
vi.mock("../docker", () => ({
  getRunningGameServers: (...a: unknown[]) => mockGetRunningGameServers(...a),
  getContainerStatus: (...a: unknown[]) => mockGetContainerStatus(...a),
}));

// ─── Mock server-actions (unused by read tools, but imported by mcp.ts) ──────
vi.mock("../server-actions", () => ({
  startServer: vi.fn(),
  stopServer: vi.fn(),
  restartServer: vi.fn(),
  updateServerConfig: vi.fn(),
}));

// ─── Mock the minecraft adapter ──────────────────────────────────────────────
const mockRunCommand = vi.fn();
const fakeAdapter = { detectedSystems: ["quests", "ftbquests"], runCommand: mockRunCommand };
const mockCreateAdapter = vi.fn().mockResolvedValue(fakeAdapter);
vi.mock("../adapters/minecraft/index", () => ({
  createMinecraftAdapter: (...a: unknown[]) => mockCreateAdapter(...a),
}));

const { default: mcpRoute } = await import("./mcp");

const MC = makeServer({ id: "minecraft", docker_image: "itzg/minecraft-server:java21" });
const TOOLS = makeServer({
  id: "desglosador3000",
  name: "Desglosador 3000",
  game_type: "tools",
  docker_image: "ghcr.io/servo98/desglosador3000:latest",
  port: 8080,
});

const HEADERS_BASE = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  origin: "https://claude.ai",
};

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await mcpRoute.request("/mcp", {
    method: "POST",
    headers: { ...HEADERS_BASE, Authorization: "Bearer mcp-token" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  const json = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);
  return JSON.parse(json.result.content[0].text as string);
}

describe("MCP read tools — list_servers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A plain (non-admin) MCP token authenticates; no browser session.
    mockSessionGet.mockReturnValue(undefined);
    mockTokenGetByToken.mockReturnValue({ id: 1, token: "mcp-token", player_name: "p" });
    mockGetRunningGameServers.mockResolvedValue([]);
    mockGetContainerStatus.mockResolvedValue("running");
    mockCreateAdapter.mockResolvedValue(fakeAdapter);
  });

  it("lists ALL servers, not just Minecraft (the desglosador3000 regression)", async () => {
    mockServerGetAll.mockReturnValue([MC, TOOLS]);
    const payload = await callTool("list_servers", {});
    expect(payload.success).toBe(true);
    const ids = (payload.data as { id: string }[]).map((s) => s.id);
    expect(ids).toContain("minecraft");
    expect(ids).toContain("desglosador3000");
  });

  it("flags Minecraft by image and exposes docker_image; non-MC gets no adapter call", async () => {
    mockServerGetAll.mockReturnValue([MC, TOOLS]);
    const payload = await callTool("list_servers", {});
    const byId = Object.fromEntries((payload.data as { id: string }[]).map((s) => [s.id, s]));

    expect(byId.minecraft.is_minecraft).toBe(true);
    expect(byId.minecraft.docker_image).toBe("itzg/minecraft-server:java21");
    expect(byId.minecraft.detected_systems).toEqual(["quests", "ftbquests"]);

    expect(byId.desglosador3000.is_minecraft).toBe(false);
    expect(byId.desglosador3000.docker_image).toBe("ghcr.io/servo98/desglosador3000:latest");
    expect(byId.desglosador3000.detected_systems).toEqual([]);

    // The minecraft adapter must NOT be built for a non-minecraft container.
    expect(mockCreateAdapter).toHaveBeenCalledWith("minecraft");
    expect(mockCreateAdapter).not.toHaveBeenCalledWith("desglosador3000");
  });
});

describe("MCP read tools — server_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockReturnValue(undefined);
    mockTokenGetByToken.mockReturnValue({ id: 1, token: "mcp-token", player_name: "p" });
    mockGetContainerStatus.mockResolvedValue("running");
    mockCreateAdapter.mockResolvedValue(fakeAdapter);
  });

  it("does NOT run the RCON 'list' on a non-Minecraft server (no $PATH garbage)", async () => {
    mockServerGetById.mockReturnValue(TOOLS);
    const payload = await callTool("server_status", { server_id: "desglosador3000" });
    expect(payload.success).toBe(true);
    expect(mockRunCommand).not.toHaveBeenCalled();
    expect(payload.data.playersOnline).toEqual([]);
    expect(payload.data.isMinecraft).toBe(false);
    expect(payload.data.dockerImage).toBe("ghcr.io/servo98/desglosador3000:latest");
  });

  it("runs the RCON 'list' and parses players for a Minecraft server", async () => {
    mockServerGetById.mockReturnValue(MC);
    mockRunCommand.mockResolvedValue("There are 1 of a max of 20 players online: Steve");
    const payload = await callTool("server_status", { server_id: "minecraft" });
    expect(mockRunCommand).toHaveBeenCalledWith("list");
    expect(payload.data.playersOnline).toEqual(["Steve"]);
    expect(payload.data.isMinecraft).toBe(true);
    expect(payload.data.dockerImage).toBe("itzg/minecraft-server:java21");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

const healthyResponse = {
  status: "operational",
  backendUptime: 3600,
  services: [
    {
      name: "backend",
      status: "healthy",
      health: "running",
      uptime: "2026-01-01T00:00:00Z",
      restarts: 0,
      memUsageMB: 128,
      memLimitMB: 512,
      cpuPercent: 5,
    },
    {
      name: "bot",
      status: "healthy",
      health: "running",
      uptime: "2026-01-01T00:00:00Z",
      restarts: 0,
      memUsageMB: 64,
      memLimitMB: 256,
      cpuPercent: 1,
    },
    {
      name: "dashboard",
      status: "healthy",
      health: "running",
      uptime: "2026-01-01T00:00:00Z",
      restarts: 0,
      memUsageMB: 32,
      memLimitMB: 128,
      cpuPercent: 0.5,
    },
    {
      name: "nginx",
      status: "healthy",
      health: "running",
      uptime: "2026-01-01T00:00:00Z",
      restarts: 0,
      memUsageMB: 16,
      memLimitMB: 64,
      cpuPercent: 0.1,
    },
  ],
  activeGame: null,
  timestamp: new Date().toISOString(),
};

// Import once at module level
const { default: Status } = await import("./Status");

describe("Status page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders All Systems Operational when all services healthy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthyResponse),
    });
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("All Systems Operational")).toBeInTheDocument();
    });
  });

  it("renders service health for all 4 infrastructure services", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthyResponse),
    });
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("Backend API")).toBeInTheDocument();
    });
    expect(screen.getByText("Discord Bot")).toBeInTheDocument();
    // "Dashboard" also appears as a link, so use getAllByText
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Reverse Proxy")).toBeInTheDocument();
  });

  it("shows Degraded Performance when a service is down", async () => {
    const degradedResponse = {
      ...healthyResponse,
      status: "degraded",
      services: healthyResponse.services.map((s) =>
        s.name === "bot" ? { ...s, status: "down", health: "stopped" } : s,
      ),
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(degradedResponse),
    });
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("Degraded Performance")).toBeInTheDocument();
    });
  });

  it("shows Unable to reach API on error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("Unable to reach API")).toBeInTheDocument();
    });
  });

  it("shows active game info when a game is running", async () => {
    const responseWithGame = {
      ...healthyResponse,
      activeGame: { name: "minecraft", image: "itzg/minecraft-server", status: "Up 2 hours" },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseWithGame),
    });
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("minecraft")).toBeInTheDocument();
    });
    expect(screen.getByText("itzg/minecraft-server")).toBeInTheDocument();
  });

  it("shows 'No game server running' when no active game", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthyResponse),
    });
    render(<Status />);
    await waitFor(() => {
      expect(screen.getByText("No game server running")).toBeInTheDocument();
    });
  });

  it("has Dashboard link back to /", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthyResponse),
    });
    render(<Status />);
    await waitFor(() => {
      // "Dashboard" appears both as a service name and as a link — find the link
      const links = screen.getAllByText("Dashboard");
      const dashLink = links.find((el) => el.tagName === "A");
      expect(dashLink).toBeTruthy();
      expect(dashLink?.getAttribute("href")).toBe("/");
    });
  });
});

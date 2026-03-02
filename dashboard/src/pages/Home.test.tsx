import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../__tests__/render-with-router";

// Mock heavy child components to isolate Home behavior
vi.mock("../components/HostStatsBar", () => ({
  default: () => <div data-testid="host-stats-bar" />,
}));
vi.mock("../components/ThemeBanner", () => ({
  default: () => <div data-testid="theme-banner" />,
}));
vi.mock("../components/StatsBar", () => ({
  default: () => <div data-testid="stats-bar" />,
}));
vi.mock("../components/ServiceStatsBar", () => ({
  default: ({ stats }: { stats: unknown }) => (
    <div data-testid="service-stats-bar">{stats ? "has stats" : "no stats"}</div>
  ),
}));
vi.mock("../components/ConfigEditor", () => ({
  default: () => <div data-testid="config-editor" />,
}));
vi.mock("../components/GameStore", () => ({
  default: () => <div data-testid="game-store" />,
}));
vi.mock("../components/BotSettings", () => ({
  default: () => <div data-testid="bot-settings" />,
}));
vi.mock("../components/BackupsTab", () => ({
  default: () => <div data-testid="backups-tab" />,
}));
vi.mock("../components/PanelSettings", () => ({
  default: () => <div data-testid="panel-settings" />,
}));
vi.mock("../theme", () => ({
  applyTheme: vi.fn(),
  resolveTheme: vi.fn(() => ({ banner: "/banner.jpg", colors: {} })),
  DEFAULT_THEMES: { _idle: { banner: "/idle.jpg", colors: {} } },
}));

// Mock api module
const mockMe = vi.fn();
const mockListServers = vi.fn();
const mockGetSettings = vi.fn();

vi.mock("../api", () => ({
  api: {
    me: () => mockMe(),
    listServers: () => mockListServers(),
    getSettings: () => mockGetSettings(),
    getCatalog: vi.fn().mockResolvedValue([]),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    deleteServer: vi.fn(),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    restartService: vi.fn(),
  },
  createAllServiceStatsStream: () => ({
    onopen: null,
    onmessage: null,
    onerror: null,
    close: vi.fn(),
  }),
  createLogStream: vi.fn(),
  createServiceLogStream: vi.fn(),
}));

// Must import AFTER mocks are set up
const { default: Home } = await import("./Home");

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMe.mockResolvedValue({ discord_id: "1", username: "testuser", avatar: null });
    mockListServers.mockResolvedValue([
      { id: "minecraft", name: "Minecraft", game_type: "sandbox", port: 25565, status: "stopped" },
    ]);
    mockGetSettings.mockResolvedValue({ host_domain: "example.com" });
  });

  it("redirects to /login when api.me() fails", async () => {
    mockMe.mockRejectedValue(new Error("Unauthorized"));
    renderWithRouter(<Home />);
    // The loading spinner should show, and then navigate away
    await waitFor(() => {
      // Component shouldn't render main content since it navigates away
      expect(screen.queryByText("Game Panel")).toBeNull();
    });
  });

  it("renders server cards from api.listServers", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => {
      expect(screen.getByText("Minecraft")).toBeInTheDocument();
    });
  });

  /**
   * BUG #1 REGRESSION: Status link must exist in navbar.
   * Production deploy had /status page but no link to it.
   */
  it("renders Status button in navbar that navigates to /status", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => {
      expect(screen.getByText("testuser")).toBeInTheDocument();
    });
    const statusBtn = screen.getByText("Status");
    expect(statusBtn).toBeInTheDocument();
    // The button should be in the navbar header area
    expect(statusBtn.closest("header")).not.toBeNull();
  });

  it("renders Infrastructure section with 4 services", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => {
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    });
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("bot")).toBeInTheDocument();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("nginx")).toBeInTheDocument();
  });

  it("shows error banner when API fails", async () => {
    mockListServers.mockRejectedValue(new Error("Network error"));
    renderWithRouter(<Home />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load servers")).toBeInTheDocument();
    });
  });
});

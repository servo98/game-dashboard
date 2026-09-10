import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../__tests__/render-with-router";

// Mock heavy child components
vi.mock("../components/HostStatsBar", () => ({
  default: () => <div data-testid="host-stats-bar" />,
}));
vi.mock("../components/StatsBar", () => ({
  default: () => <div data-testid="stats-bar" />,
}));
vi.mock("../components/ServiceStatsBar", () => ({
  default: () => <div data-testid="service-stats-bar" />,
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
  applyAccent: vi.fn(),
  applyMode: vi.fn(() => "dark"),
  readModePreference: vi.fn(() => "system"),
  watchSystemMode: vi.fn(() => () => {}),
  resolveTheme: vi.fn(() => ({ banner: "/banner.jpg", accent: "#3b7dd8" })),
  DEFAULT_THEMES: { _idle: { banner: "/idle.jpg", accent: "#3b7dd8" } },
}));

vi.mock("../api", () => ({
  api: {
    me: vi.fn().mockResolvedValue({
      discord_id: "1",
      username: "user",
      avatar: null,
      status: "approved",
      role: "admin",
    }),
    listServers: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({ host_domain: "example.com" }),
    getCatalog: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    restartService: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    deleteServer: vi.fn(),
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

const { default: Home } = await import("./Home");

describe("Home tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to servers tab with Infrastructure visible", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => {
      expect(screen.getByText("Infraestructura")).toBeInTheDocument();
    });
  });

  it("switches to Bot tab", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => screen.getByText("Bot"));
    fireEvent.click(screen.getByText("Bot"));
    expect(screen.getByTestId("bot-settings")).toBeInTheDocument();
    // Infrastructure should NOT be visible on Bot tab
    expect(screen.queryByText("Infraestructura")).not.toBeInTheDocument();
  });

  it("switches to Backups tab", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => screen.getByText("Copias"));
    fireEvent.click(screen.getByText("Copias"));
    expect(screen.getByTestId("backups-tab")).toBeInTheDocument();
  });

  it("switches to Settings tab", async () => {
    renderWithRouter(<Home />);
    await waitFor(() => screen.getByText("Ajustes"));
    fireEvent.click(screen.getByText("Ajustes"));
    expect(screen.getByTestId("panel-settings")).toBeInTheDocument();
  });
});

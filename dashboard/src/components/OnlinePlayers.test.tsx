import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPlayers = vi.fn();

vi.mock("../api", () => ({
  api: {
    getPlayers: (...args: unknown[]) => mockGetPlayers(...args),
  },
}));

const { default: OnlinePlayers } = await import("./OnlinePlayers");

describe("OnlinePlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("returns null for games without a player list", () => {
    const { container } = render(
      <OnlinePlayers
        serverId="foundryvtt"
        dockerImage="felddy/foundryvtt:release"
        joinable="joinable"
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(mockGetPlayers).not.toHaveBeenCalled();
  });

  it("does not poll when joinable is 'starting'", () => {
    render(
      <OnlinePlayers
        serverId="minecraft"
        dockerImage="itzg/minecraft-server:java21"
        joinable="starting"
      />,
    );
    vi.advanceTimersByTime(20_000);
    expect(mockGetPlayers).not.toHaveBeenCalled();
  });

  it("does not poll when joinable is null", () => {
    render(
      <OnlinePlayers
        serverId="minecraft"
        dockerImage="itzg/minecraft-server:java21"
        joinable={null}
      />,
    );
    vi.advanceTimersByTime(20_000);
    expect(mockGetPlayers).not.toHaveBeenCalled();
  });

  it("does not poll when joinable is undefined", () => {
    render(<OnlinePlayers serverId="minecraft" dockerImage="itzg/minecraft-server:java21" />);
    vi.advanceTimersByTime(20_000);
    expect(mockGetPlayers).not.toHaveBeenCalled();
  });

  it("does not poll a Valheim server that is still starting", () => {
    render(
      <OnlinePlayers
        serverId="valheim"
        dockerImage="lloesche/valheim-server:latest"
        joinable="starting"
      />,
    );
    vi.advanceTimersByTime(20_000);
    expect(mockGetPlayers).not.toHaveBeenCalled();
  });

  it("polls immediately when joinable is 'joinable'", async () => {
    mockGetPlayers.mockResolvedValue({ online: ["Steve"], count: 1, max: 20 });
    vi.useRealTimers();

    render(
      <OnlinePlayers
        serverId="minecraft"
        dockerImage="itzg/minecraft-server:java21"
        joinable="joinable"
      />,
    );

    await waitFor(() => {
      expect(mockGetPlayers).toHaveBeenCalledWith("minecraft");
    });

    await waitFor(() => {
      expect(screen.getByText("1/20")).toBeInTheDocument();
    });
  });

  it("renders player avatars when players are online", async () => {
    mockGetPlayers.mockResolvedValue({ online: ["Steve", "Alex"], count: 2, max: 20 });
    vi.useRealTimers();

    render(
      <OnlinePlayers
        serverId="minecraft"
        dockerImage="itzg/minecraft-server:java21"
        joinable="joinable"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2/20")).toBeInTheDocument();
    });

    const avatars = screen.getAllByRole("img");
    expect(avatars).toHaveLength(2);
    expect(avatars[0]).toHaveAttribute("alt", "Steve");
    expect(avatars[1]).toHaveAttribute("alt", "Alex");
  });

  it("renders Valheim players as names, not avatars", async () => {
    mockGetPlayers.mockResolvedValue({
      online: ["Jevus", "Chuchin"],
      count: 2,
      max: 10,
    });
    vi.useRealTimers();

    render(
      <OnlinePlayers
        serverId="valheim"
        dockerImage="lloesche/valheim-server:latest"
        joinable="joinable"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2/10")).toBeInTheDocument();
    });

    expect(screen.getByText("Jevus")).toBeInTheDocument();
    expect(screen.getByText("Chuchin")).toBeInTheDocument();
    // mc-heads no sirve caras de Valheim, así que no debe pintar imágenes
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("omits the max when A2S did not report it", async () => {
    mockGetPlayers.mockResolvedValue({ online: ["Jevus"], count: 1, max: 0 });
    vi.useRealTimers();

    render(
      <OnlinePlayers
        serverId="valheim"
        dockerImage="lloesche/valheim-server:latest"
        joinable="joinable"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });
});

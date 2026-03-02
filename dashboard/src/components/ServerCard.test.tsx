import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameServer } from "../api";

// Mock StatsBar since it connects to SSE
vi.mock("./StatsBar", () => ({
  default: () => <div data-testid="stats-bar" />,
}));

// Mock api for backup/history calls
vi.mock("../api", () => ({
  api: {
    getServerHistory: vi.fn().mockResolvedValue([]),
    listBackups: vi.fn().mockResolvedValue([]),
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
    restoreBackup: vi.fn(),
    downloadBackupUrl: vi.fn(() => "/download"),
  },
}));

const { default: ServerCard } = await import("./ServerCard");

const stoppedServer: GameServer = {
  id: "minecraft",
  name: "Minecraft",
  game_type: "sandbox",
  port: 25565,
  status: "stopped",
};

const runningServer: GameServer = {
  id: "minecraft",
  name: "Minecraft",
  game_type: "sandbox",
  port: 25565,
  status: "running",
};

const defaultProps = {
  isActive: false,
  onStart: vi.fn(),
  onStop: vi.fn(),
  onViewLogs: vi.fn(),
  onEditConfig: vi.fn(),
  onDelete: vi.fn(),
  loading: false,
  hostDomain: "example.com",
};

describe("ServerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * BUG #2 REGRESSION: Start button must be rendered for stopped servers
   * and must call onStart on click.
   */
  it("renders Start button for stopped servers and calls onStart on click", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} />);
    const startBtn = screen.getByText("Start");
    expect(startBtn).toBeInTheDocument();
    fireEvent.click(startBtn);
    expect(defaultProps.onStart).toHaveBeenCalledWith("minecraft");
  });

  it("renders Stop button for running servers and calls onStop on click", () => {
    render(<ServerCard server={runningServer} {...defaultProps} isActive />);
    const stopBtn = screen.getByText("Stop");
    expect(stopBtn).toBeInTheDocument();
    fireEvent.click(stopBtn);
    expect(defaultProps.onStop).toHaveBeenCalledWith("minecraft");
  });

  /**
   * BUG #3 REGRESSION: Logs button must be rendered ONLY for running servers.
   */
  it("renders Logs button only for running servers", () => {
    const { rerender } = render(<ServerCard server={stoppedServer} {...defaultProps} />);
    expect(screen.queryByTitle("Logs")).not.toBeInTheDocument();

    rerender(<ServerCard server={runningServer} {...defaultProps} isActive />);
    expect(screen.getByTitle("Logs")).toBeInTheDocument();
  });

  it("Logs button calls onViewLogs on click", () => {
    render(<ServerCard server={runningServer} {...defaultProps} isActive />);
    fireEvent.click(screen.getByTitle("Logs"));
    expect(defaultProps.onViewLogs).toHaveBeenCalledTimes(1);
  });

  it("shows 'Starting...' when loading and button is disabled", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} loading />);
    const btn = screen.getByText("Starting...");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("shows connect address when running", () => {
    render(<ServerCard server={runningServer} {...defaultProps} isActive />);
    // For sandbox game type on port 25565, the address is mc.example.com
    expect(screen.getByText("mc.example.com")).toBeInTheDocument();
  });

  it("renders edit config button when stopped", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} />);
    const configBtn = screen.getByTitle("Edit config");
    expect(configBtn).toBeInTheDocument();
    fireEvent.click(configBtn);
    expect(defaultProps.onEditConfig).toHaveBeenCalledTimes(1);
  });

  it("delete requires double-click confirmation", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} />);
    const deleteBtn = screen.getByTitle("Delete server");
    fireEvent.click(deleteBtn);
    // First click shows confirmation
    expect(screen.getByText("Confirm?")).toBeInTheDocument();
    expect(defaultProps.onDelete).not.toHaveBeenCalled();
    // Second click actually deletes
    fireEvent.click(screen.getByText("Confirm?"));
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
  });
});

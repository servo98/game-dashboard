import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameServer } from "../api";

// Mock StatsBar since it connects to SSE
vi.mock("./StatsBar", () => ({
  default: () => <div data-testid="stats-bar" />,
}));

// Mock OnlinePlayers since it polls the API
vi.mock("./OnlinePlayers", () => ({
  default: () => <div data-testid="online-players" />,
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
  docker_image: "itzg/minecraft-server:java21",
  port: 25565,
  status: "stopped",
};

const runningServer: GameServer = {
  id: "minecraft",
  name: "Minecraft",
  game_type: "sandbox",
  docker_image: "itzg/minecraft-server:java21",
  port: 25565,
  status: "running",
};

const defaultProps = {
  isActive: false,
  onStart: vi.fn(),
  onStop: vi.fn(),
  onViewLogs: vi.fn(),
  onEditConfig: vi.fn(),
  onOpenFiles: vi.fn(),
  onDelete: vi.fn(),
  onForceUpdate: vi.fn(),
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
    const startBtn = screen.getByText("Arrancar");
    expect(startBtn).toBeInTheDocument();
    fireEvent.click(startBtn);
    expect(defaultProps.onStart).toHaveBeenCalledWith("minecraft");
  });

  it("renders Stop button for running servers and calls onStop on click", () => {
    render(<ServerCard server={runningServer} {...defaultProps} isActive />);
    const stopBtn = screen.getByText("Detener");
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
    expect(screen.getByTitle("Registro")).toBeInTheDocument();
  });

  it("Logs button calls onViewLogs on click", () => {
    render(<ServerCard server={runningServer} {...defaultProps} isActive />);
    fireEvent.click(screen.getByTitle("Registro"));
    expect(defaultProps.onViewLogs).toHaveBeenCalledTimes(1);
  });

  it("shows 'Starting...' when loading and button is disabled", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} loading />);
    const btn = screen.getByText("Arrancando");
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
    const configBtn = screen.getByTitle("Configuración");
    expect(configBtn).toBeInTheDocument();
    fireEvent.click(configBtn);
    expect(defaultProps.onEditConfig).toHaveBeenCalledTimes(1);
  });

  it("shows 'Starting...' status when joinable is 'starting'", () => {
    const startingServer: GameServer = { ...runningServer, joinable: "starting" };
    render(<ServerCard server={startingServer} {...defaultProps} isActive />);
    expect(screen.getByText("Arrancando")).toBeInTheDocument();
  });

  it("shows 'Ready' status when joinable is 'joinable'", () => {
    const readyServer: GameServer = { ...runningServer, joinable: "joinable" };
    render(<ServerCard server={readyServer} {...defaultProps} isActive />);
    expect(screen.getByText("Listo")).toBeInTheDocument();
  });

  it("shows 'Running' status when joinable is null (non-MC server)", () => {
    const noJoinableServer: GameServer = { ...runningServer, joinable: null };
    render(<ServerCard server={noJoinableServer} {...defaultProps} isActive />);
    expect(screen.getByText("En marcha")).toBeInTheDocument();
  });

  it("delete requires double-click confirmation", () => {
    render(<ServerCard server={stoppedServer} {...defaultProps} />);
    const deleteBtn = screen.getByTitle("Borrar servidor");
    fireEvent.click(deleteBtn);
    // First click shows confirm button
    expect(screen.getByTitle("Confirmar borrado del servidor y sus ficheros")).toBeInTheDocument();
    expect(defaultProps.onDelete).not.toHaveBeenCalled();
    // Second click confirms deletion
    fireEvent.click(screen.getByTitle("Confirmar borrado del servidor y sus ficheros"));
    expect(defaultProps.onDelete).toHaveBeenCalledWith("minecraft", true);
  });

  /**
   * El aviso de versión es la única señal de que un server se quedó atrás: el
   * contenedor no lo dice (loguea que está al día aunque no lo esté).
   */
  it("no dice nada de versiones cuando la instalada es la última", () => {
    render(
      <ServerCard
        server={{ ...runningServer, update_state: "up-to-date" }}
        {...defaultProps}
        isActive
      />,
    );
    expect(screen.queryByText(/versión/i)).toBeNull();
  });

  it("avisa de una versión pendiente y ofrece actualizar", () => {
    const onForceUpdate = vi.fn();
    render(
      <ServerCard
        server={{ ...runningServer, update_state: "update-pending" }}
        {...defaultProps}
        onForceUpdate={onForceUpdate}
        isActive
      />,
    );

    expect(screen.getByText(/versión nueva que el servidor aún no ha instalado/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Actualizar"));
    expect(onForceUpdate).toHaveBeenCalledWith("minecraft");
  });

  it("dice explícitamente que reiniciar no arregla un update atascado", () => {
    render(
      <ServerCard
        server={{ ...runningServer, update_state: "update-failed" }}
        {...defaultProps}
        isActive
      />,
    );

    expect(screen.getByText(/reiniciar no lo arregla/i)).toBeTruthy();
    expect(screen.getByText("Reparar")).toBeTruthy();
  });

  it("no ofrece reparar a quien no es admin", () => {
    render(
      <ServerCard
        server={{ ...runningServer, update_state: "update-failed" }}
        {...defaultProps}
        isAdmin={false}
        isActive
      />,
    );

    expect(screen.getByText(/reiniciar no lo arregla/i)).toBeTruthy();
    expect(screen.queryByText("Reparar")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerConfig = vi.fn();
const mockUpdateServerConfig = vi.fn();
const mockListConfigFiles = vi.fn();
const mockReadTextFile = vi.fn();
const mockWriteTextFile = vi.fn();

vi.mock("../api", () => ({
  api: {
    getServerConfig: (...args: unknown[]) => mockGetServerConfig(...args),
    updateServerConfig: (...args: unknown[]) => mockUpdateServerConfig(...args),
    listConfigFiles: (...args: unknown[]) => mockListConfigFiles(...args),
    readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
    writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
    uploadBanner: vi.fn(),
    deleteBanner: vi.fn(),
    stopServer: vi.fn(),
    startServer: vi.fn(),
  },
}));

const { default: ConfigEditor } = await import("./ConfigEditor");

const VALHEIM_CONFIG = {
  name: "Valheim",
  port: 2456,
  docker_image: "lloesche/valheim-server:latest",
  env_vars: {
    SERVER_NAME: "Game Panel - Valheim",
    SERVER_PUBLIC: "1",
    SERVER_ARGS: "-preset hard -setkey nomap",
  },
  volumes: {},
  banner_path: null,
  accent_color: null,
};

const MOD_CFG = [
  "[Beehive]",
  "",
  "## Miel por segundo.",
  "# Setting type: Int32",
  "# Default value: 1200",
  "# Acceptable value range: From 10 to 2400",
  "honeyProductionSpeed = 1200",
].join("\n");

function renderEditor(overrides: Partial<Record<string, unknown>> = {}) {
  return render(
    <ConfigEditor
      serverId="valheim"
      serverName="Valheim"
      gameType="valheim"
      open
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ConfigEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerConfig.mockResolvedValue(VALHEIM_CONFIG);
    mockListConfigFiles.mockResolvedValue([]);
    mockUpdateServerConfig.mockResolvedValue({ ok: true });
    mockWriteTextFile.mockResolvedValue({ ok: true });
  });

  it("muestra las secciones de Valheim en la navegación", async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByText("Mundo y dificultad")).toBeInTheDocument());
    expect(screen.getByText("Backups")).toBeInTheDocument();
    expect(screen.getByText("Mods")).toBeInTheDocument();
  });

  it("no ofrece las secciones de Valheim para otro juego", async () => {
    mockGetServerConfig.mockResolvedValue({
      ...VALHEIM_CONFIG,
      docker_image: "itzg/minecraft-server:java21",
    });
    renderEditor({ gameType: "minecraft" });
    await waitFor(() => expect(screen.getByText("Minecraft")).toBeInTheDocument());
    expect(screen.queryByText("Mundo y dificultad")).not.toBeInTheDocument();
  });

  it("lee los world modifiers que ya venían en SERVER_ARGS", async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByText("Mundo y dificultad")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Mundo y dificultad"));

    expect(screen.getByRole("combobox")).toHaveValue("hard");
    expect(screen.getByText("-preset hard -setkey nomap")).toBeInTheDocument();
  });

  it("un cambio en el formulario guiado llega a las variables de entorno", async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByText("Servidor")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Mundo y dificultad"));
    fireEvent.click(screen.getByText("Muy difícil"));

    fireEvent.click(screen.getByText("Variables de entorno"));
    expect(
      screen.getByDisplayValue("-preset hard -modifier combat veryhard -setkey nomap"),
    ).toBeInTheDocument();
  });

  it("lista los ficheros de config descubiertos y los carga al abrirlos", async () => {
    mockListConfigFiles.mockResolvedValue([
      { path: "config/bepinex/config/mimod.cfg", name: "mimod.cfg", size: 200, modifiedAt: 1 },
    ]);
    mockReadTextFile.mockResolvedValue({ path: "x", content: MOD_CFG, size: 200 });

    renderEditor();
    await waitFor(() => expect(screen.getByText("mimod.cfg")).toBeInTheDocument());
    fireEvent.click(screen.getByText("mimod.cfg"));

    // El slider sale de los metadatos del propio fichero.
    await waitFor(() => expect(screen.getByText("honeyProductionSpeed")).toBeInTheDocument());
    expect(screen.getByRole("slider")).toHaveAttribute("min", "10");
    expect(screen.getByRole("slider")).toHaveAttribute("max", "2400");
  });

  it("guarda config y ficheros modificados en el mismo botón", async () => {
    mockListConfigFiles.mockResolvedValue([
      { path: "config/mimod.cfg", name: "mimod.cfg", size: 200, modifiedAt: 1 },
    ]);
    mockReadTextFile.mockResolvedValue({ path: "x", content: MOD_CFG, size: 200 });

    renderEditor();
    await waitFor(() => expect(screen.getByText("mimod.cfg")).toBeInTheDocument());
    fireEvent.click(screen.getByText("mimod.cfg"));
    await waitFor(() => expect(screen.getByRole("slider")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("slider"), { target: { value: "600" } });
    fireEvent.click(screen.getByText("Guardar"));

    await waitFor(() => expect(mockUpdateServerConfig).toHaveBeenCalled());
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "valheim",
      "config/mimod.cfg",
      expect.stringContaining("honeyProductionSpeed = 600"),
    );
  });

  it("no toca ficheros que no se han modificado", async () => {
    mockListConfigFiles.mockResolvedValue([
      { path: "config/mimod.cfg", name: "mimod.cfg", size: 200, modifiedAt: 1 },
    ]);
    mockReadTextFile.mockResolvedValue({ path: "x", content: MOD_CFG, size: 200 });

    renderEditor();
    await waitFor(() => expect(screen.getByText("mimod.cfg")).toBeInTheDocument());
    fireEvent.click(screen.getByText("mimod.cfg"));
    await waitFor(() => expect(screen.getByRole("slider")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() => expect(mockUpdateServerConfig).toHaveBeenCalled());
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it("sigue funcionando si el escaneo de ficheros falla", async () => {
    mockListConfigFiles.mockRejectedValue(new Error("nope"));
    renderEditor();
    await waitFor(() => expect(screen.getByText("No disponible")).toBeInTheDocument());
    expect(screen.getByText("Guardar")).toBeInTheDocument();
  });
});

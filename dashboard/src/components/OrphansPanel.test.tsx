import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrphanCleanup, Orphans } from "../api";

const getOrphans = vi.fn();
const cleanupOrphans = vi.fn();
vi.mock("../api", () => ({
  api: {
    getOrphans: (...a: unknown[]) => getOrphans(...a),
    cleanupOrphans: (...a: unknown[]) => cleanupOrphans(...a),
  },
}));

const { default: OrphansPanel } = await import("./OrphansPanel");

const NONE: Orphans = {
  containers: [],
  backup_dirs: [],
  banners: [],
  db_rows: [],
  dangling_images: 0,
};

const SOME: Orphans = {
  containers: [
    {
      name: "game-panel-pzserver",
      image: "gameservermanagers/gameserver:pz",
      status: "Exited (0) 6 weeks ago",
      running: false,
    },
  ],
  backup_dirs: [{ server_id: "minecraft-magico", files: 0, bytes: 0 }],
  banners: ["terrariaserver.png"],
  db_rows: [{ table: "user_server_access", server_id: "minecraft-magico", rows: 1 }],
  dangling_images: 42,
};

const DONE: OrphanCleanup = {
  containers_removed: ["game-panel-pzserver"],
  containers_skipped: [],
  images_removed: 43,
  backup_dirs_removed: ["minecraft-magico"],
  banners_removed: ["terrariaserver.png"],
  db_rows_removed: 1,
  bytes_reclaimed: 8 * 1024 ** 3,
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrphansPanel", () => {
  it("sin restos lo dice y no ofrece limpiar", async () => {
    getOrphans.mockResolvedValue(NONE);
    render(<OrphansPanel />);

    expect(
      await screen.findByText("No queda nada de servidores que ya no existen."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lista cada resto antes de borrar nada", async () => {
    getOrphans.mockResolvedValue(SOME);
    render(<OrphansPanel />);

    expect(
      await screen.findByText("game-panel-pzserver · gameservermanagers/gameserver:pz"),
    ).toBeInTheDocument();
    expect(screen.getByText("minecraft-magico · carpeta vacía")).toBeInTheDocument();
    expect(screen.getByText("terrariaserver.png")).toBeInTheDocument();
    expect(screen.getByText("minecraft-magico · 1 en user_server_access")).toBeInTheDocument();
    expect(screen.getByText("42 sin etiqueta, de actualizaciones anteriores")).toBeInTheDocument();
    expect(cleanupOrphans).not.toHaveBeenCalled();
  });

  it("limpiar pide confirmación: el primer clic no borra", async () => {
    getOrphans.mockResolvedValueOnce(SOME).mockResolvedValueOnce(NONE);
    cleanupOrphans.mockResolvedValue(DONE);
    render(<OrphansPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Limpiar" }));
    expect(cleanupOrphans).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar borrado" }));
    await waitFor(() => expect(cleanupOrphans).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByText(
        "Borrado: 1 contenedores, 43 imágenes, 1 carpetas de copias, 1 banners, 1 registros. Liberado: unos 8.00 GB.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No queda nada de servidores que ya no existen."),
    ).toBeInTheDocument();
  });

  it("un contenedor sin servidor que sigue en marcha se avisa y no se ofrece borrar", async () => {
    getOrphans.mockResolvedValue({
      ...NONE,
      containers: [{ name: "game-panel-x", image: "img", status: "Up 2 hours", running: true }],
    });
    render(<OrphansPanel />);

    expect(await screen.findByText("game-panel-x · no se toca mientras corra")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

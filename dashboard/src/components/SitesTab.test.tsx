import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ServiceStats } from "../api";

// ServiceStatsBar no necesita mockearse (no toca red), pero lo aislamos igual
// para no depender de su presentación exacta en estos tests.
vi.mock("./ServiceStatsBar", () => ({
  default: ({ stats }: { stats: unknown }) => (
    <div data-testid="service-stats-bar">{stats ? "has stats" : "no stats"}</div>
  ),
}));

const { default: SitesTab } = await import("./SitesTab");

describe("SitesTab", () => {
  it("agrupa los servicios en Sitios e Infraestructura del panel", () => {
    render(
      <SitesTab
        serviceStats={{}}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    expect(screen.getByText("Sitios")).toBeInTheDocument();
    expect(screen.getByText("Infraestructura del panel")).toBeInTheDocument();

    // Sitios: proyectos con dominio propio
    expect(screen.getByText("ChatPapol")).toBeInTheDocument();
    expect(screen.getByText("Koff")).toBeInTheDocument();
    expect(screen.getByText("Filebrowser (Rubas)")).toBeInTheDocument();

    // Infraestructura: lo que sostiene al resto
    expect(screen.getByText("API del panel")).toBeInTheDocument();
    expect(screen.getByText("Panel web")).toBeInTheDocument();
  });

  it("enlaza los dominios públicos de un sitio a su URL real", () => {
    render(
      <SitesTab
        serviceStats={{}}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "coffeekoff.com" });
    expect(link).toHaveAttribute("href", "https://coffeekoff.com");
  });

  it("nginx no es un enlace: 'todos los dominios' es solo una etiqueta", () => {
    render(
      <SitesTab
        serviceStats={{}}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    expect(screen.getByText("todos los dominios")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "todos los dominios" })).not.toBeInTheDocument();
  });

  it("nginx y el panel web no muestran botón de reiniciar", () => {
    render(
      <SitesTab
        serviceStats={{}}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    // Hay servicios reiniciables (backend, bot, chatpapol...) así que el
    // texto "Reiniciar" existe, pero no colgando de la tarjeta de nginx/dashboard.
    const restartButtons = screen.getAllByText("Reiniciar");
    expect(restartButtons.length).toBeGreaterThan(0);

    const nginxCard = screen.getByText("Proxy inverso").closest("article");
    const dashboardCard = screen.getByText("Panel web").closest("article");
    expect(nginxCard).not.toBeNull();
    expect(dashboardCard).not.toBeNull();
    expect(nginxCard?.textContent).not.toContain("Reiniciar");
    expect(dashboardCard?.textContent).not.toContain("Reiniciar");
  });

  it("llama a onRestart con el id del servicio al pulsar Reiniciar", () => {
    const onRestart = vi.fn();
    render(
      <SitesTab
        serviceStats={{}}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={onRestart}
      />,
    );

    const koffCard = screen.getByText("Koff").closest("article");
    expect(koffCard).not.toBeNull();
    const restartBtn = koffCard?.querySelector("button:last-of-type") as HTMLElement;
    fireEvent.click(restartBtn);
    expect(onRestart).toHaveBeenCalledWith("koff");
  });

  it("muestra las estadísticas cuando llegan por el stream", () => {
    const stats: Record<string, ServiceStats> = {
      koff: { service: "koff", cpuPercent: 1.2, memUsageMB: 32, memLimitMB: 128 },
    };
    render(
      <SitesTab
        serviceStats={stats}
        restartingService={null}
        onViewLogs={vi.fn()}
        onRestart={vi.fn()}
      />,
    );

    const koffCard = screen.getByText("Koff").closest("article");
    expect(koffCard?.textContent).toContain("has stats");
  });
});

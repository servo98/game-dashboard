import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  /**
   * REGRESIÓN: el efecto que enfoca la hoja dependía de `onClose`. Como los
   * padres pasan una flecha nueva en cada render (`onClose={() => setX(null)}`)
   * y el panel re-renderiza constantemente por el stream de estadísticas, el
   * efecto se reejecutaba y robaba el foco del campo: escribías y perdías el
   * cursor a cada carácter.
   */
  it("no roba el foco cuando el padre pasa un onClose nuevo", () => {
    const { rerender } = render(
      <Modal title="Prueba" onClose={() => {}}>
        <input aria-label="campo" />
      </Modal>,
    );

    const input = screen.getByLabelText("campo");
    input.focus();
    expect(document.activeElement).toBe(input);

    // Un re-render del padre: misma función en intención, identidad distinta.
    rerender(
      <Modal title="Prueba" onClose={() => {}}>
        <input aria-label="campo" />
      </Modal>,
    );

    expect(document.activeElement).toBe(input);
  });

  it("sigue cerrando con Escape tras varios re-renders del padre", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal title="Prueba" onClose={() => onClose("primero")}>
        <p>contenido</p>
      </Modal>,
    );

    // La última versión de onClose es la que debe ejecutarse, no la de montaje.
    rerender(
      <Modal title="Prueba" onClose={() => onClose("ultimo")}>
        <p>contenido</p>
      </Modal>,
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledWith("ultimo");
  });

  it("libera el scroll del cuerpo al desmontarse", () => {
    const { unmount } = render(
      <Modal title="Prueba" onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

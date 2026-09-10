import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockEventSource } from "../__tests__/mock-event-source";

const { default: LogViewer } = await import("./LogViewer");

/** Flush one rAF cycle so batched lines land in state */
function flushRaf() {
  vi.runAllTimers();
  vi.advanceTimersByTime(0);
}

describe("LogViewer", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      return setTimeout(cb, 0) as unknown as number;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * BUG #3 REGRESSION: LogViewer must create EventSource from factory on mount.
   */
  it("creates EventSource from streamFactory on mount", () => {
    const factory = vi.fn(
      () => new MockEventSource("/api/servers/minecraft/logs") as unknown as EventSource,
    );
    render(<LogViewer title="minecraft" streamFactory={factory} onClose={onClose} />);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/servers/minecraft/logs");
  });

  it("shows green connected dot after open", async () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    render(<LogViewer title="test" streamFactory={factory} onClose={onClose} />);

    // Wait for microtask (onopen fires)
    await act(() => Promise.resolve());

    // The green dot has the bg-ok class
    const dot = document.querySelector(".bg-ok");
    expect(dot).not.toBeNull();
  });

  it("displays log lines when messages arrive via SSE", async () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    render(<LogViewer title="test" streamFactory={factory} onClose={onClose} />);

    await act(() => Promise.resolve());

    const es = MockEventSource.instances[0];
    act(() => {
      es.__simulateMessage(JSON.stringify("Hello server log"));
      flushRaf();
    });

    // Flush the second rAF (auto-scroll) too
    act(() => flushRaf());

    expect(screen.getByText(/Hello server log/)).toBeInTheDocument();
  });

  it("muestra el aviso de espera al abrir", () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    render(<LogViewer title="test" streamFactory={factory} onClose={onClose} />);
    expect(screen.getByText("Esperando salida del registro.")).toBeInTheDocument();
  });

  it("shows red dot on error", async () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    render(<LogViewer title="test" streamFactory={factory} onClose={onClose} />);

    await act(() => Promise.resolve());

    const es = MockEventSource.instances[0];
    act(() => {
      es.__simulateError();
    });

    const redDot = document.querySelector(".bg-danger");
    expect(redDot).not.toBeNull();
  });

  it("close button calls onClose", async () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    render(<LogViewer title="test" streamFactory={factory} onClose={onClose} />);

    await act(() => Promise.resolve());

    // El modal ofrece dos formas de cerrar: el velo y el botón de la cabecera.
    const [, closeBtn] = screen.getAllByLabelText("Cerrar");
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes EventSource on unmount", async () => {
    const factory = () => new MockEventSource("/logs") as unknown as EventSource;
    const { unmount } = render(
      <LogViewer title="test" streamFactory={factory} onClose={onClose} />,
    );

    await act(() => Promise.resolve());

    const es = MockEventSource.instances[0];
    expect(es.close).not.toHaveBeenCalled();
    unmount();
    expect(es.close).toHaveBeenCalledTimes(1);
  });
});

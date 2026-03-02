import { vi } from "vitest";

/**
 * MockEventSource for jsdom (which lacks native EventSource).
 * Tracks instances in a static array for per-test access.
 */
export class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  withCredentials: boolean;
  readyState = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 2; // CLOSED
  });

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);

    // Auto-fire onopen on next microtick
    queueMicrotask(() => {
      if (this.readyState !== 2) {
        this.readyState = 1; // OPEN
        this.onopen?.(new Event("open"));
      }
    });
  }

  /** Simulate receiving a message from the server */
  __simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  /** Simulate an error (e.g. connection lost) */
  __simulateError() {
    this.onerror?.(new Event("error"));
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

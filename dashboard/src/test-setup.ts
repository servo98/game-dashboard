import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { MockEventSource } from "./__tests__/mock-event-source";

// Register MockEventSource globally (jsdom lacks native EventSource)
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

afterEach(() => {
  cleanup();
  MockEventSource.reset();
});

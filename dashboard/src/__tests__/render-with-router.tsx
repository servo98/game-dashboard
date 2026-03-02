import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

/**
 * Wraps a component in MemoryRouter so useNavigate and other
 * react-router hooks work in tests.
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: RenderOptions & { initialEntries?: string[] } = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    ),
    ...options,
  });
}

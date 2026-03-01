import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DB_PATH: ":memory:",
    },
    alias: {
      "bun:sqlite": resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__mocks__/**", "src/index.ts", "src/seed.ts"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
});

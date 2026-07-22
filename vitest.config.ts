import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.page.tsx",
        "src/**/*.config.*",
        "src/router.tsx",
        "src/ssr.tsx",
        "src/server.ts",
        "src/styles.css.ts",
      ],
      thresholds: {
        lines: 40,
        statements: 40,
        functions: 30,
        branches: 25,
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import { COVERAGE_THRESHOLDS } from "./scripts/coverage-thresholds";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.page.tsx",
        "src/**/*.config.*",
        "src/router.tsx",
        "src/ssr.tsx",
        "src/server.ts",
        "src/styles.css.ts",
      ],
      // Fonte única, compartilhada com o gerador do resumo — ver
      // scripts/coverage-thresholds.ts.
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});

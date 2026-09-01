import { defineConfig } from "vitest/config";
import { COVERAGE_THRESHOLDS } from "./scripts/coverage-thresholds";

export default defineConfig({
  // Same globals vite.config.ts injects via define in the real app:
  // without this, any test that imports (even transitively) a module that
  // references __COMMIT_HASH__/__COMMIT_DATE__ at module scope (e.g.
  // src/lib/instrument-server.ts, in Sentry.init({ release: __COMMIT_HASH__ }))
  // breaks with a ReferenceError: the exact value doesn't matter in a
  // test, it just needs to exist.
  define: {
    __COMMIT_HASH__: JSON.stringify("test"),
    __COMMIT_DATE__: JSON.stringify("0"),
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
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
        "src/styles.css.ts",
      ],
      // Single source, shared with the summary generator -- see
      // scripts/coverage-thresholds.ts.
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});

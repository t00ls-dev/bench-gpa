import { defineConfig } from "vitest/config";
import { COVERAGE_THRESHOLDS } from "./scripts/coverage-thresholds";

export default defineConfig({
  // Mesmos globals que vite.config.ts injeta via define no app real: sem
  // isto, qualquer teste que importe (mesmo transitivamente) um módulo que
  // referencie __COMMIT_HASH__/__COMMIT_DATE__ no escopo do módulo (ex:
  // src/lib/instrument-server.ts, em Sentry.init({ release: __COMMIT_HASH__ }))
  // quebra com ReferenceError: valor exato não importa em teste, só precisa
  // existir.
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

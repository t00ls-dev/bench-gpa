import { execSync } from "child_process";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import { nitro } from "nitro/vite";

let commitHash = "dev";
let commitTimestamp = "0";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
  commitTimestamp = execSync("git log -1 --format=%ct").toString().trim();
} catch {
  // commit info not available
}

export default defineConfig({
  build: { chunkSizeWarningLimit: 1000 },
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DATE__: JSON.stringify(commitTimestamp),
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      client: { entry: "client" },
      server: { entry: "server" },
      router: { routeFileIgnorePattern: "\\.page\\.tsx" },
    }),
    nitro({ preset: "node-server" }),
    react(),
    // Sem SENTRY_AUTH_TOKEN (dev, PR de fora, ambiente sem os secrets), o
    // plugin fica de fora inteiro: upload de source map é o único papel dele
    // aqui (o tunnel já é feito manualmente em src/server.ts e src/client.tsx),
    // então não tem por que rodar sem token.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryTanstackStart({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            autoInstrumentMiddleware: false,
          }),
        ]
      : []),
  ],
});

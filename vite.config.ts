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
    nitro({
      preset: "node-server",
      rolldownConfig: {
        experimental: {
          // Avoids the dynamic-entry facade cycle tracked in rolldown#10734.
          chunkOptimization: { avoidRedundantChunkLoads: false },
        },
      },
    }),
    react(),
    // Without SENTRY_AUTH_TOKEN (dev, an external PR, an environment
    // without the secrets), the plugin is left out entirely: source map
    // upload is its only job here (the tunnel is already handled manually
    // in src/server.ts and src/client.tsx), so there's no reason to run it
    // without a token.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryTanstackStart({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            autoInstrumentMiddleware: false,
            // Without this, the plugin uses GITHUB_SHA (full hash) as the
            // source map upload's release name, while Sentry.init({release})
            // in client.tsx/instrument-server.ts uses __COMMIT_HASH__ (short
            // hash, the same commitHash variable below). Different names
            // never match, and Sentry associates a source map with an event
            // by exact release match: without this, production stack
            // traces stay minified.
            release: { name: commitHash },
          }),
        ]
      : []),
  ],
});

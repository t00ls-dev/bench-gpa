import { execSync } from "child_process";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import compression from "vite-plugin-compression";

let commitHash = "dev";
let commitTimestamp = "0";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
  commitTimestamp = execSync("git log -1 --format=%ct").toString().trim();
} catch {}

export default defineConfig({
  vite: {
    build: { chunkSizeWarningLimit: 1000 },
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash),
      __COMMIT_DATE__: JSON.stringify(commitTimestamp),
    },
    plugins: [
      compression({ algorithm: "brotliCompress", ext: ".br" }),
      compression({ algorithm: "gzip", ext: ".gz" }),
    ],
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});

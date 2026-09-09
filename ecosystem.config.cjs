const { resolve } = require("node:path");

process.loadEnvFile(resolve(__dirname, ".env"));
const env = process.env;

module.exports = {
  apps: [
    {
      name: "bench-gpa",
      // "current" is a symlink to releases/<sha>/, never a real directory
      // (see .github/workflows/ci.yml, "Atomic swap" step). Node resolves
      // the entry module's REAL path (follows the symlink) on the initial
      // import(): once up, each worker stays pinned forever to its own
      // releases/.../, immune to a symlink swap that happens afterward --
      // that's what avoids the asset ENOENT that the old scheme (swapping
      // content at the SAME ".output" path) caused in workers still up
      // during cluster mode's gradual reload (found on 08/04/2026, the
      // third rollback of the day: see docs/medicao-performance.md).
      script: "current/server/index.mjs",
      // fork (not cluster): the VPS has 1 physical core, so a second worker
      // never gains real CPU parallelism, it only doubles the Node/V8
      // overhead on a box that's already swapping (see
      // docs/analise-servidor-producao-2026-07-31.md). Cluster mode was
      // tried from 08/04 to 08/06/2026 purely to get pm2 reload's
      // gradual worker-by-worker swap (closer to zero-downtime deploys),
      // but it caused real production incidents on its own (three
      // rollbacks the day it shipped, one of them a genuine upstream PM2
      // bug, Unitech/pm2#3946) without ever fully delivering zero downtime
      // (measured residual: ~6.2s of real 502s on a deploy even with the
      // retry mitigation in place). See docs/medicao-performance.md,
      // 2026-08-06 entry, for the full reasoning behind reverting to fork.
      //
      // SimpleCache (src/lib/cache.ts) and the RateLimiters
      // (src/lib/rate-limit.ts) go back to being true process-wide
      // singletons with a single instance -- no more per-worker dilution.
      instances: 1,
      exec_mode: "fork",
      // With a single instance, `pm2 reload`/`startOrReload` is equivalent
      // to a restart (no gradual swap to wait on), so this mostly matters
      // for the deploy healthcheck's patience window while the one worker
      // boots (MariaDB connection pool, Sentry SDK, route registration).
      // Kept at the same value measured under cluster mode's CPU
      // contention (~4.8s per worker, two competing for the one core):
      // with a single worker and no contention, boot should be faster,
      // but there's no measured number for fork mode yet and a generous
      // ceiling here is harmless (it only bounds how long the deploy
      // script waits before giving up).
      listen_timeout: 8000,
      env: {
        NODE_ENV: "production",
        PORT: env.PORT ?? "3000",
        DB_HOST: env.DB_HOST ?? "",
        DB_PORT: env.DB_PORT ?? "",
        DB_NAME: env.DB_NAME ?? "",
        DB_USER: env.DB_USER ?? "",
        DB_PASS: env.DB_PASS ?? "",
        JWT_SECRET: env.JWT_SECRET ?? "",
        TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? "",
        TURNSTILE_BYPASS: env.TURNSTILE_BYPASS ?? "",
        SENTRY_DSN: env.SENTRY_DSN ?? "",
      },
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};

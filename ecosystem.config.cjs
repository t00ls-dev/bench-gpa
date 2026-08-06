const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadEnv() {
  const envFile = resolve(__dirname, ".env");
  try {
    const content = readFileSync(envFile, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      let val = trimmed.slice(sep + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();

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
      // cluster (not fork): pm2 reload does a gradual worker-by-worker swap
      // (brings up the new one, waits for it to respond, only then kills
      // the old one) instead of fork mode's full restart. On a 1-core VPS,
      // 2 instances gain no real CPU parallelism, it's just enough to
      // always have at least one worker up during the swap.
      //
      // Process-level in-memory state stops being global to the app with
      // this: SimpleCache (src/lib/cache.ts) and the RateLimiters
      // (src/lib/rate-limit.ts) become per-worker, no longer singletons.
      // Cache: only slightly reduces the hit rate, no bug. Rate limit: the
      // effective per-IP ceiling dilutes per worker, consciously accepted
      // (see docs/medicao-performance.md) because authLimiter's real
      // bottleneck is bcrypt's CPU cost, shared between the workers on the
      // same core, not the counter itself.
      instances: 2,
      exec_mode: "cluster",
      // PM2's default (GRACEFUL_LISTEN_TIMEOUT) is 3000ms: too short for
      // our real boot time under reload. Measured in production
      // (08/04/2026, two consecutive deploy failures caused by this): each
      // worker consistently takes ~4.8s from the reload request to
      // confirming "listening" (MariaDB connection pool, Sentry SDK, route
      // registration, all competing for the single CPU while the other
      // worker boots at the same time). Without this, PM2 gives up waiting
      // before the new worker responds, considers the reload failed, and
      // the deploy workflow rolls back to the previous build even though
      // both workers are healthy a moment later. 8000ms gives comfortable
      // margin above the measured value, the same order of magnitude as
      // PM2's own default GRACEFUL_TIMEOUT (8000ms).
      listen_timeout: 8000,
      env: {
        NODE_ENV: "production",
        PORT: env.PORT ?? "3000",
        DB_HOST: env.DB_HOST ?? "localhost",
        DB_PORT: env.DB_PORT ?? "3306",
        DB_NAME: env.DB_NAME ?? "admin_gpa",
        DB_USER: env.DB_USER ?? "admin_gpa",
        DB_PASS: env.DB_PASS ?? "",
        JWT_SECRET: env.JWT_SECRET ?? "",
        TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? "",
        TURNSTILE_BYPASS: env.TURNSTILE_BYPASS ?? "false",
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

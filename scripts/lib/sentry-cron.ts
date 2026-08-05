// Sentry init for the cron scripts (purge-aggs, refresh-universe): they run
// as a standalone bun process fired by crontab, not through the Vite/Nitro
// build, so they have no access to __COMMIT_HASH__/__COMMIT_DATE__ (those
// globals only exist via vite.config.ts's `define`) and don't go through
// TanStack Start's server-function pipeline where Sentry's ambient capture
// is broken (see src/lib/instrument-server.ts). Here it's a linear script
// with no nested middleware, so Sentry.withMonitor()/captureCheckIn()
// (which use getClient() under the hood) work normally.
//
// @sentry/node directly (not @sentry/tanstackstart-react): it's the
// package that exports withMonitor/captureCheckIn, the other one doesn't
// re-export the Cron Monitors API. Added as a direct dependency in
// package.json even though it already comes in transitively (via
// @sentry/tanstackstart-react) to avoid depending on implicit lockfile hoisting.
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
});

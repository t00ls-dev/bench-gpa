import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";

// Lets the client compare its own build (baked in at bundle time) against
// what's actually running on the server right now, to detect a stale SPA
// tab that never reloaded after a deploy (see useVersionCheck()).
export const getBuildInfo = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(() => ({ commitHash: __COMMIT_HASH__ }));

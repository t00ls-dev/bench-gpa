import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { apiLimiter, uploadLimiter, authLimiter, getClientIp } from "./rate-limit";
import { rejectRateLimit } from "./rate-limit-response";

export function requireRateLimit(tier: "api" | "upload" | "auth" = "api") {
  // "auth": same ceiling as login (10/IP, 40 global) -- changePassword does a
  // bcrypt.compare just as CPU-expensive as a login (see BCRYPT_COST in
  // auth-config.ts), the generic "api" tier (300/min) would be a CPU DoS
  // vector on a single-core VPS.
  const limiter = tier === "upload" ? uploadLimiter : tier === "auth" ? authLimiter : apiLimiter;

  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    const result = limiter.check(ip);

    if (!result.allowed) {
      rejectRateLimit(result, "Muitas requisições. Aguarde um minuto e tente novamente.");
    }

    return next();
  });
}

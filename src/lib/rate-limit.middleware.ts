import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { apiLimiter, uploadLimiter, getClientIp } from "./rate-limit";

export function requireRateLimit(tier: "api" | "upload" = "api") {
  const limiter = tier === "upload" ? uploadLimiter : apiLimiter;

  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    const result = limiter.check(ip);

    if (!result.allowed) {
      throw new Error("Muitas requisições. Aguarde um minuto e tente novamente.");
    }

    return next();
  });
}

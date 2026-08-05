import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { apiLimiter, uploadLimiter, authLimiter, getClientIp } from "./rate-limit";

export function requireRateLimit(tier: "api" | "upload" | "auth" = "api") {
  // "auth": mesmo teto do login (10/IP, 40 global) -- changePassword faz um
  // bcrypt.compare tão caro em CPU quanto um login (ver BCRYPT_COST em
  // auth-config.ts), o tier "api" genérico (300/min) seria um vetor de DoS de
  // CPU numa VPS de um núcleo só.
  const limiter = tier === "upload" ? uploadLimiter : tier === "auth" ? authLimiter : apiLimiter;

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

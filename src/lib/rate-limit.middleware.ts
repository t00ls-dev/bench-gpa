import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { apiLimiter, uploadLimiter, getClientIp } from "./rate-limit";

export const requireRateLimit = createMiddleware({ type: "function" }).server(
  async ({ next, data }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    const isUpload =
      typeof data === "object" &&
      data !== null &&
      ("rows" in data || "batch_id" in data || "sale_date" in data);

    const limiter = isUpload ? uploadLimiter : apiLimiter;
    const result = limiter.check(ip);

    if (!result.allowed) {
      throw new Error("Muitas requisições. Aguarde um minuto e tente novamente.");
    }

    return next();
  },
);

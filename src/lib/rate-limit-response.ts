import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import type { RateLimitResult } from "./rate-limit";

export function rejectRateLimit(result: RateLimitResult, message: string): never {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  setResponseStatus(429);
  setResponseHeader("Retry-After", String(retryAfter));
  throw new Error(message);
}

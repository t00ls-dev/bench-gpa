interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private globalWindows = new Map<string, WindowEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private windowMs: number,
    private maxPerIp: number,
    private maxGlobal: number,
    private label: string,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();

    const entry = this.windows.get(ip);
    if (!entry || now > entry.resetAt) {
      this.windows.set(ip, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }

    const globalEntry = this.globalWindows.get("global");
    if (!globalEntry || now > globalEntry.resetAt) {
      this.globalWindows.set("global", { count: 1, resetAt: now + this.windowMs });
    } else {
      globalEntry.count++;
    }

    const ipEntry = this.windows.get(ip)!;
    const gEntry = this.globalWindows.get("global")!;

    if (ipEntry.count > this.maxPerIp || gEntry.count > this.maxGlobal) {
      const resetAt = Math.max(ipEntry.resetAt, gEntry.resetAt);
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: Math.min(this.maxPerIp - ipEntry.count, this.maxGlobal - gEntry.count),
      resetAt: Math.min(ipEntry.resetAt, gEntry.resetAt),
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now > entry.resetAt) this.windows.delete(key);
    }
    for (const [key, entry] of this.globalWindows) {
      if (now > entry.resetAt) this.globalWindows.delete(key);
    }
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

export function getClientIp(request?: Request): string {
  if (!request) return "unknown";
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export const apiLimiter = new RateLimiter(60_000, 120, 300, "api");
export const authLimiter = new RateLimiter(60_000, 5, 20, "auth");
export const uploadLimiter = new RateLimiter(60_000, 30, 60, "upload");
export const ssrLimiter = new RateLimiter(60_000, 120, 600, "ssr");

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
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * The order of the two budgets matters: the per-IP ceiling is evaluated
   * FIRST, and if it already fails, the request leaves without touching the
   * global counter.
   *
   * Both counters used to be incremented at once, before any verdict: so
   * the abuser's own rejections kept pushing the shared counter. With
   * authLimiter (10/IP, 40 global), a single-IP curl loop was enough: the
   * first 10 passed, from the 11th on they were rejected but kept adding
   * up, and on reaching 41 login went down for EVERYONE: an attacker
   * amplified to 100% of the user base, no botnet needed.
   *
   * With the short-circuit, an IP's maximum contribution to the global
   * budget is maxPerIp. The global ceiling goes back to being what it
   * should be: an aggregate-load circuit breaker, that only trips with
   * traffic that's actually distributed.
   */
  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();

    let ipEntry = this.windows.get(ip);
    if (!ipEntry || now > ipEntry.resetAt) {
      ipEntry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(ip, ipEntry);
    }
    ipEntry.count++;

    if (ipEntry.count > this.maxPerIp) {
      return { allowed: false, remaining: 0, resetAt: ipEntry.resetAt };
    }

    let gEntry = this.globalWindows.get("global");
    if (!gEntry || now > gEntry.resetAt) {
      gEntry = { count: 0, resetAt: now + this.windowMs };
      this.globalWindows.set("global", gEntry);
    }
    gEntry.count++;

    if (gEntry.count > this.maxGlobal) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Math.max(ipEntry.resetAt, gEntry.resetAt),
      };
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

/** Normalizes an IP: strips spaces, port (1.2.3.4:5678), and the IPv4-mapped prefix. */
function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;
  // IPv4-mapped in IPv6: ::ffff:1.2.3.4 → 1.2.3.4
  ip = ip.replace(/^::ffff:/i, "");
  // Strips the IPv4 port (1.2.3.4:5678); IPv6 stays intact (contains several ":").
  if (ip.includes(".") && ip.includes(":")) ip = ip.split(":")[0];
  return ip || null;
}

/**
 * Client's real IP, covering multiple proxy scenarios.
 *
 * Trust order (behind Cloudflare, X-Forwarded-For[0] is SPOOFABLE, since CF
 * only appends the visitor's IP, so the first hop can be forged by the
 * client; that's why CF's own headers come first):
 *   1. CF-Connecting-IP: Cloudflare default (overwritten by CF)
 *   2. True-Client-IP: Cloudflare Enterprise
 *   3. X-Real-IP: origin nginx, direct access without CF
 *   4. X-Forwarded-For: last resort (first hop)
 *
 * Infra note: to fully trust CF-Connecting-IP, the origin must only accept
 * traffic from Cloudflare (allowlist of CF IP ranges, or Authenticated
 * Origin Pulls); otherwise, direct access to the VPS could forge this
 * header.
 */
export function getClientIp(request?: Request): string {
  if (!request) return "unknown";
  const h = request.headers;
  const candidate =
    normalizeIp(h.get("cf-connecting-ip")) ??
    normalizeIp(h.get("true-client-ip")) ??
    normalizeIp(h.get("x-real-ip")) ??
    normalizeIp(h.get("x-forwarded-for")?.split(",")[0]);
  return candidate ?? "unknown";
}

/**
 * Counting window for the four tiers. One minute for all of them: the value
 * used to be repeated literally in each construction, giving the impression
 * they were separately adjustable when in practice they never diverged.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Ceilings per tier: `[perIp, global]`.
 *
 * Don't loosen without measuring: the VPS has one core and two real users.
 * The `auth` ceiling is the most sensitive: every login attempt costs a
 * cost-12 bcrypt (see BCRYPT_COST in auth-config.ts), which saturates the
 * core by itself.
 *
 * The global ceiling is an aggregate-load circuit breaker, not a per-user
 * limit: an IP's maximum contribution to it is its own per-IP ceiling,
 * thanks to the short-circuit documented in `check()`.
 *
 * `auth` was loosened to [15, 60] from 2026-08-05 to 2026-08-06 to
 * compensate for cluster mode's per-worker dilution (2 processes, each with
 * its own counter). Reverted back to [10, 40] when PM2 went back to fork/1
 * instance (see docs/medicao-performance.md, 2026-08-06 entry): with a
 * single process there's no dilution left to compensate for, and this
 * ceiling is the real per-IP defense (Turnstile already covers the
 * automated part of the problem on the two routes that receive anonymous
 * traffic in this tier -- login, first access). `changePassword` also uses
 * this tier but is only reachable by someone who already has a valid
 * session (`requireAuthAllowExpiredPassword` runs before the rate limit in
 * the middleware), so this ceiling doesn't gate anonymous traffic there.
 */
const RATE_LIMITS = {
  api: [300, 1000],
  auth: [10, 40],
  upload: [200, 500],
  ssr: [300, 1500],
} as const;

export const apiLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.api);
export const authLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.auth);
export const uploadLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.upload);
export const ssrLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.ssr);

/**
 * Bucket per account, independent from the `authLimiter` above (which is per
 * IP). Covers the case where a credential-stuffing attack distributes
 * attempts against ONE account across several IPs: each isolated IP never
 * hits the authLimiter's 10/min ceiling, but the target account keeps
 * getting attempt after attempt.
 *
 * Deliberately longer window (15min) than the other tiers: the goal here
 * isn't the VPS's aggregate throughput (that's already authLimiter's job):
 * it's containing someone who already knows which account they're
 * targeting, even switching IPs on every request. `maxGlobal` as
 * `Number.MAX_SAFE_INTEGER` deliberately turns off the class's second tier
 * (the aggregate-load circuit breaker already exists in authLimiter); this
 * bucket only needs the per-key ceiling.
 *
 * The key is `user:<id>` when the account is resolved (not the string typed
 * in): switching between login by username and by employee_id for the SAME
 * account can't reset the bucket, and `id` never changes even if the admin
 * edits the username later. Account not found uses `identifier:<raw>` as
 * the key, keeping the same coverage against brute-force of a nonexistent
 * account.
 *
 * 10 (not less): both login and first access already require Turnstile
 * before accepting the attempt, which covers the automated part of the
 * problem; this bucket is the defense that's left against a human/script
 * insisting on a specific account. 10/15min gives real slack for a typo
 * without giving up this containment.
 */
const AUTH_ACCOUNT_WINDOW_MS = 15 * 60_000;
const AUTH_ACCOUNT_MAX_PER_KEY = 10;
export const authAccountLimiter = new RateLimiter(
  AUTH_ACCOUNT_WINDOW_MS,
  AUTH_ACCOUNT_MAX_PER_KEY,
  Number.MAX_SAFE_INTEGER,
);

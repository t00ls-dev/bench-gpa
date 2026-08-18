import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter, UPLOAD_RATE_LIMIT_PER_IP, getClientIp } from "./rate-limit";
import { IMPORT_CHUNK_SIZE, IMPORT_MAX_ROWS } from "./import-config";

function req(headers: Record<string, string>): Request {
  return new Request("http://x/", { headers });
}

describe("getClientIp", () => {
  it("returns 'unknown' with no request", () => {
    expect(getClientIp(undefined)).toBe("unknown");
  });

  it("returns 'unknown' with no IP headers", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("prioritizes CF-Connecting-IP even with a forged X-Forwarded-For", () => {
    expect(
      getClientIp(
        req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7", "cf-connecting-ip": "203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("uses True-Client-IP (CF Enterprise) when there's no CF-Connecting-IP", () => {
    expect(getClientIp(req({ "true-client-ip": "198.51.100.4", "x-real-ip": "10.0.0.1" }))).toBe(
      "198.51.100.4",
    );
  });

  it("uses X-Real-IP on direct nginx access (no Cloudflare)", () => {
    expect(getClientIp(req({ "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
  });

  it("falls back to X-Forwarded-For's first hop as a last resort", () => {
    expect(getClientIp(req({ "x-forwarded-for": "192.0.2.9, 10.0.0.1" }))).toBe("192.0.2.9");
  });

  it("normalizes port and IPv4-mapped-in-IPv6", () => {
    expect(getClientIp(req({ "cf-connecting-ip": "::ffff:203.0.113.7" }))).toBe("203.0.113.7");
    expect(getClientIp(req({ "x-real-ip": "192.0.2.5:54321" }))).toBe("192.0.2.5");
  });

  it("ignores an empty header and moves to the next candidate", () => {
    expect(getClientIp(req({ "cf-connecting-ip": "  ", "x-real-ip": "192.0.2.5" }))).toBe(
      "192.0.2.5",
    );
  });
});

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(60_000, 5, 20);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("allows first request", () => {
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("blocks after exceeding per-IP limit", () => {
    for (let i = 0; i < 5; i++) {
      const r = limiter.check("1.2.3.4");
      expect(r.allowed).toBe(true);
    }
    const blocked = limiter.check("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("allows different IPs independently", () => {
    for (let i = 0; i < 10; i++) {
      const r = limiter.check(`1.2.3.${i}`);
      expect(r.allowed).toBe(true);
    }
  });

  it("resets after window expires", () => {
    for (let i = 0; i < 6; i++) limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("blocks on global limit", () => {
    const smallLimiter = new RateLimiter(60_000, 100, 3);

    smallLimiter.check("1.1.1.1"); // allowed
    smallLimiter.check("2.2.2.2"); // allowed
    smallLimiter.check("3.3.3.3"); // allowed
    const r = smallLimiter.check("4.4.4.4"); // global exceeded
    expect(r.allowed).toBe(false);

    smallLimiter.destroy();
  });

  it("does not allocate new IP entries after the global limit is saturated", () => {
    const smallLimiter = new RateLimiter(60_000, 100, 3);
    for (let i = 0; i < 3; i++) smallLimiter.check(`10.0.0.${i}`);

    const windows = Reflect.get(smallLimiter, "windows") as Map<string, unknown>;
    expect(windows.size).toBe(3);
    for (let i = 0; i < 100; i++) {
      expect(smallLimiter.check(`192.0.2.${i}`).allowed).toBe(false);
    }
    expect(windows.size).toBe(3);

    smallLimiter.destroy();
  });

  it("the cleanup timer removes expired entries without another check", () => {
    limiter.check("1.2.3.4");
    const windows = Reflect.get(limiter, "windows") as Map<string, unknown>;
    expect(windows.size).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(windows.size).toBe(0);
  });

  it("resets one key without affecting other keys", () => {
    limiter.check("1.2.3.4");
    limiter.check("5.6.7.8");

    limiter.reset("1.2.3.4");

    const windows = Reflect.get(limiter, "windows") as Map<string, unknown>;
    expect(windows.has("1.2.3.4")).toBe(false);
    expect(windows.has("5.6.7.8")).toBe(true);
  });
});

describe("upload rate-limit budget", () => {
  it("fits the largest accepted file plus begin and finalize calls", () => {
    const requests = Math.ceil(IMPORT_MAX_ROWS / IMPORT_CHUNK_SIZE) + 2;
    expect(requests).toBeLessThanOrEqual(UPLOAD_RATE_LIMIT_PER_IP);
  });
});

describe("RateLimiter: the global budget can't be weaponized by a single IP", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a request already blocked by IP does not consume the global budget", () => {
    const l = new RateLimiter(60_000, 5, 20);

    // Attacker fires 25x; only the first 5 pass the per-IP limit.
    for (let i = 0; i < 25; i++) l.check("6.6.6.6");

    // Victim on the first request of her life: it has to pass. Before,
    // the attacker's 20 rejections also incremented the global counter and
    // blew past the ceiling of 20, so a curl loop could take down login for everyone.
    expect(l.check("10.0.0.1").allowed).toBe(true);

    l.destroy();
  });

  it("a single IP consumes at most maxPerIp of the global budget", () => {
    const l = new RateLimiter(60_000, 5, 20);

    for (let i = 0; i < 100; i++) l.check("6.6.6.6");

    // 15 left of the global ceiling (20 - 5 from the attacker) for distinct IPs.
    for (let i = 1; i <= 15; i++) {
      expect(l.check(`10.0.0.${i}`).allowed).toBe(true);
    }

    l.destroy();
  });

  it("still trips the breaker when the load is genuinely distributed", () => {
    const l = new RateLimiter(60_000, 5, 20);

    // 20 distinct IPs, 1 request each -> legitimately exhausts the global ceiling.
    for (let i = 1; i <= 20; i++) {
      expect(l.check(`10.0.1.${i}`).allowed).toBe(true);
    }
    expect(l.check("10.0.2.1").allowed).toBe(false);

    l.destroy();
  });

  it("the global budget recovers when the window expires", () => {
    const l = new RateLimiter(60_000, 5, 20);

    for (let i = 1; i <= 20; i++) l.check(`10.0.1.${i}`);
    expect(l.check("10.0.2.1").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(l.check("10.0.2.1").allowed).toBe(true);

    l.destroy();
  });
});

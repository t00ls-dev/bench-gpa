import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(60_000, 5, 20, "test");
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
    const smallLimiter = new RateLimiter(60_000, 100, 3, "small");

    smallLimiter.check("1.1.1.1"); // allowed
    smallLimiter.check("2.2.2.2"); // allowed
    smallLimiter.check("3.3.3.3"); // allowed
    const r = smallLimiter.check("4.4.4.4"); // global exceeded
    expect(r.allowed).toBe(false);

    smallLimiter.destroy();
  });

  it("cleanup removes expired entries", () => {
    limiter.check("1.2.3.4");
    vi.advanceTimersByTime(60_001);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });
});

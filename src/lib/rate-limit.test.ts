import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter, getClientIp } from "./rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://x/", { headers });
}

describe("getClientIp", () => {
  it("retorna 'unknown' sem request", () => {
    expect(getClientIp(undefined)).toBe("unknown");
  });

  it("retorna 'unknown' sem headers de IP", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("prioriza CF-Connecting-IP mesmo com X-Forwarded-For forjado", () => {
    expect(
      getClientIp(
        req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7", "cf-connecting-ip": "203.0.113.7" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("usa True-Client-IP (CF Enterprise) quando não há CF-Connecting-IP", () => {
    expect(getClientIp(req({ "true-client-ip": "198.51.100.4", "x-real-ip": "10.0.0.1" }))).toBe(
      "198.51.100.4",
    );
  });

  it("usa X-Real-IP em acesso direto ao nginx (sem Cloudflare)", () => {
    expect(getClientIp(req({ "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
  });

  it("cai para o primeiro salto do X-Forwarded-For como último recurso", () => {
    expect(getClientIp(req({ "x-forwarded-for": "192.0.2.9, 10.0.0.1" }))).toBe("192.0.2.9");
  });

  it("normaliza porta e IPv4-mapeado em IPv6", () => {
    expect(getClientIp(req({ "cf-connecting-ip": "::ffff:203.0.113.7" }))).toBe("203.0.113.7");
    expect(getClientIp(req({ "x-real-ip": "192.0.2.5:54321" }))).toBe("192.0.2.5");
  });

  it("ignora header vazio e segue para o próximo candidato", () => {
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

  it("cleanup removes expired entries", () => {
    limiter.check("1.2.3.4");
    vi.advanceTimersByTime(60_001);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });
});

describe("RateLimiter — orçamento global não é armável por um IP só", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("requisição já barrada por IP não consome o orçamento global", () => {
    const l = new RateLimiter(60_000, 5, 20);

    // Atacante dispara 25x; só as 5 primeiras passam pelo limite por IP.
    for (let i = 0; i < 25; i++) l.check("6.6.6.6");

    // Vítima na primeira requisição da vida dela: tem que passar. Antes, as 20
    // rejeições do atacante também incrementavam o contador global e estouravam
    // o teto de 20 — um curl em loop derrubava o login de todo mundo.
    expect(l.check("10.0.0.1").allowed).toBe(true);

    l.destroy();
  });

  it("um IP consome no máximo maxPerIp do orçamento global", () => {
    const l = new RateLimiter(60_000, 5, 20);

    for (let i = 0; i < 100; i++) l.check("6.6.6.6");

    // Sobram 15 do teto global (20 - 5 do atacante) para IPs distintos.
    for (let i = 1; i <= 15; i++) {
      expect(l.check(`10.0.0.${i}`).allowed).toBe(true);
    }

    l.destroy();
  });

  it("ainda dispara o disjuntor quando a carga é de fato distribuída", () => {
    const l = new RateLimiter(60_000, 5, 20);

    // 20 IPs distintos, 1 requisição cada → esgota o teto global legitimamente.
    for (let i = 1; i <= 20; i++) {
      expect(l.check(`10.0.1.${i}`).allowed).toBe(true);
    }
    expect(l.check("10.0.2.1").allowed).toBe(false);

    l.destroy();
  });

  it("o orçamento global se recupera quando a janela expira", () => {
    const l = new RateLimiter(60_000, 5, 20);

    for (let i = 1; i <= 20; i++) l.check(`10.0.1.${i}`);
    expect(l.check("10.0.2.1").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(l.check("10.0.2.1").allowed).toBe(true);

    l.destroy();
  });
});

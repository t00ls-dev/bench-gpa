// Covers the missing piece: `requireRateLimit()` is the middleware that
// actually applies the rate limit on every non-auth function, but in every
// *.functions.test.ts it's mocked as a passthrough: nothing proves it
// actually blocks, or that the real production ceilings (apiLimiter
// 300/min, uploadLimiter 200/min) are wired correctly (see
// docs/auditoria-qa-2026-08-01.md, item 4).
//
// `vi.resetModules()` + a dynamic import per test gives each test a fresh
// `apiLimiter`/`uploadLimiter` (singletons recreated from scratch on
// reimporting "./rate-limit"). Without this, each tier's GLOBAL budget
// (shared across every IP) would leak from one test into another.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (fn: unknown) => fn }),
}));

const getRequestMock = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => getRequestMock(),
}));

type Middleware = (opts: { next: () => unknown }) => Promise<unknown>;

function requestFromIp(ip: string): Request {
  return new Request("https://gpa.t00ls.dev/", { headers: { "cf-connecting-ip": ip } });
}

async function freshRequireRateLimit() {
  vi.resetModules();
  const mod = await import("./rate-limit.middleware");
  return mod.requireRateLimit;
}

beforeEach(() => {
  getRequestMock.mockReset();
});

describe("requireRateLimit", () => {
  it("libera a requisição dentro do teto e propaga o retorno de next()", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.1"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    await expect(mw({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("bloqueia a 301ª requisição do mesmo IP no tier api (teto real: 300/min)", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.2"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    for (let i = 0; i < 300; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");
    expect(next).toHaveBeenCalledTimes(300); // the 301st never gets to call next()
  });

  it("bloqueia a 201ª requisição do mesmo IP no tier upload (teto real: 200/min)", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.3"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("upload") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    for (let i = 0; i < 200; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");
    expect(next).toHaveBeenCalledTimes(200);
  });

  it("usa o tier 'api' por padrão quando nenhum é informado", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.4"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit() as unknown as Middleware; // no argument
    const next = vi.fn(async () => "ok");

    // If the default were "upload" (ceiling 200), this would already have blocked.
    for (let i = 0; i < 250; i++) await mw({ next });
    await expect(mw({ next })).resolves.toBe("ok");
  });

  it("orçamento é por IP: um IP bloqueado não afeta outro IP no mesmo tier", async () => {
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("upload") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    getRequestMock.mockReturnValue(requestFromIp("203.0.113.5"));
    for (let i = 0; i < 200; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");

    getRequestMock.mockReturnValue(requestFromIp("203.0.113.6"));
    await expect(mw({ next })).resolves.toBe("ok");
  });

  it("tiers diferentes têm orçamentos independentes para o mesmo IP", async () => {
    const requireRateLimit = await freshRequireRateLimit();
    const next = vi.fn(async () => "ok");
    const ip = "203.0.113.7";
    getRequestMock.mockReturnValue(requestFromIp(ip));

    const uploadMw = requireRateLimit("upload") as unknown as Middleware;
    for (let i = 0; i < 200; i++) await uploadMw({ next });
    await expect(uploadMw({ next })).rejects.toThrow("Muitas requisições");

    // Same IP, "api" tier: untouched by the consumption above.
    const apiMw = requireRateLimit("api") as unknown as Middleware;
    await expect(apiMw({ next })).resolves.toBe("ok");
  });

  it("resolve o IP via getClientIp (CF-Connecting-IP) e ainda funciona sem nenhum header", async () => {
    getRequestMock.mockReturnValue(new Request("https://gpa.t00ls.dev/"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    await expect(mw({ next })).resolves.toBe("ok");
  });
});

// Covers the missing piece: `requireRateLimit()` is the middleware that
// actually applies the rate limit on every non-auth function, but in every
// *.functions.test.ts it's mocked as a passthrough: nothing proves it
// actually blocks, or that the real production ceilings (apiLimiter
// 300/min, uploadLimiter 250/min) are wired correctly (see
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
const setResponseStatusMock = vi.fn();
const setResponseHeaderMock = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => getRequestMock(),
  setResponseStatus: (status: number) => setResponseStatusMock(status),
  setResponseHeader: (name: string, value: string) => setResponseHeaderMock(name, value),
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
  setResponseStatusMock.mockReset();
  setResponseHeaderMock.mockReset();
});

describe("requireRateLimit", () => {
  it("allows the request within the ceiling and propagates next()'s return value", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.1"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    await expect(mw({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("blocks the 301st request from the same IP in the api tier (real ceiling: 300/min)", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.2"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    for (let i = 0; i < 300; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");
    expect(next).toHaveBeenCalledTimes(300); // the 301st never gets to call next()
    expect(setResponseStatusMock).toHaveBeenCalledWith(429);
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Retry-After", "60");
  });

  it("blocks the 251st request from the same IP in the upload tier (real ceiling: 250/min)", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.3"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("upload") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    for (let i = 0; i < 250; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");
    expect(next).toHaveBeenCalledTimes(250);
  });

  it("uses the 'api' tier by default when none is given", async () => {
    getRequestMock.mockReturnValue(requestFromIp("203.0.113.4"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit() as unknown as Middleware; // no argument
    const next = vi.fn(async () => "ok");

    // If the default were "upload" (ceiling 250), this would already have blocked.
    for (let i = 0; i < 275; i++) await mw({ next });
    await expect(mw({ next })).resolves.toBe("ok");
  });

  it("the budget is per IP: a blocked IP does not affect another IP in the same tier", async () => {
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("upload") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    getRequestMock.mockReturnValue(requestFromIp("203.0.113.5"));
    for (let i = 0; i < 250; i++) await mw({ next });
    await expect(mw({ next })).rejects.toThrow("Muitas requisições");

    getRequestMock.mockReturnValue(requestFromIp("203.0.113.6"));
    await expect(mw({ next })).resolves.toBe("ok");
  });

  it("different tiers have independent budgets for the same IP", async () => {
    const requireRateLimit = await freshRequireRateLimit();
    const next = vi.fn(async () => "ok");
    const ip = "203.0.113.7";
    getRequestMock.mockReturnValue(requestFromIp(ip));

    const uploadMw = requireRateLimit("upload") as unknown as Middleware;
    for (let i = 0; i < 250; i++) await uploadMw({ next });
    await expect(uploadMw({ next })).rejects.toThrow("Muitas requisições");

    // Same IP, "api" tier: untouched by the consumption above.
    const apiMw = requireRateLimit("api") as unknown as Middleware;
    await expect(apiMw({ next })).resolves.toBe("ok");
  });

  it("resolves the IP via getClientIp (CF-Connecting-IP) and still works with no headers at all", async () => {
    getRequestMock.mockReturnValue(new Request("https://gpa.t00ls.dev/"));
    const requireRateLimit = await freshRequireRateLimit();
    const mw = requireRateLimit("api") as unknown as Middleware;
    const next = vi.fn(async () => "ok");

    await expect(mw({ next })).resolves.toBe("ok");
  });
});

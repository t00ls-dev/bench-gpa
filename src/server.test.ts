import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limiterResult = () => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
  return {
    limiterResult,
    handlerFetch: vi.fn(async () => new Response("ok")),
    storePdf: vi.fn(() => "download-token"),
    serverFnCheck: vi.fn(limiterResult),
    pdfCheck: vi.fn(limiterResult),
    monitoringCheck: vi.fn(limiterResult),
    ssrCheck: vi.fn(limiterResult),
  };
});

vi.mock("./lib/instrument-server", () => ({}));
vi.mock("./lib/error-capture", () => ({ consumeLastCapturedError: vi.fn(() => null) }));
vi.mock("./lib/boot-guards", () => ({ assertSafeBoot: vi.fn() }));
vi.mock("./lib/csp-server", () => ({
  runWithCspNonce: (_nonce: string, fn: () => unknown) => fn(),
}));
vi.mock("./lib/error-page", () => ({ renderErrorPage: () => "error" }));
vi.mock("./lib/session", () => ({
  resolveSession: vi.fn(async () => ({ userId: "user-1" })),
}));
vi.mock("./lib/auth-config", () => ({ SESSION_COOKIE: "session" }));
vi.mock("./lib/pdf-download-store", () => ({
  storePdf: mocks.storePdf,
  takePdf: vi.fn(() => null),
}));
vi.mock("./lib/rate-limit", () => ({
  getClientIp: () => "203.0.113.1",
  serverFnLimiter: { check: mocks.serverFnCheck },
  pdfLimiter: { check: mocks.pdfCheck },
  monitoringLimiter: { check: mocks.monitoringCheck },
  ssrLimiter: { check: mocks.ssrCheck },
}));
vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: mocks.handlerFetch },
}));
vi.mock("@sentry/tanstackstart-react", () => ({
  captureException: vi.fn(),
  wrapFetchWithSentry: vi.fn(),
}));
vi.mock("@sentry/core", () => ({
  parseEnvelope: vi.fn(() => {
    throw new Error("invalid");
  }),
  serializeEnvelope: vi.fn(),
  makeDsn: vi.fn(),
  getEnvelopeEndpointWithUrlEncodedAuth: vi.fn(),
}));

import serverEntry from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serverFnCheck.mockImplementation(mocks.limiterResult);
  mocks.pdfCheck.mockImplementation(mocks.limiterResult);
  mocks.monitoringCheck.mockImplementation(mocks.limiterResult);
  mocks.ssrCheck.mockImplementation(mocks.limiterResult);
  mocks.handlerFetch.mockResolvedValue(new Response("ok"));
  mocks.storePdf.mockReturnValue("download-token");
});

describe("server request tiers", () => {
  it.each([
    ["server function", "POST", "https://gpa.t00ls.dev/_serverFn/action", mocks.serverFnCheck],
    ["PDF", "GET", "https://gpa.t00ls.dev/api/pdf-download/token", mocks.pdfCheck],
    ["monitoring", "POST", "https://gpa.t00ls.dev/monitoring", mocks.monitoringCheck],
    ["SSR", "GET", "https://gpa.t00ls.dev/dashboard", mocks.ssrCheck],
  ])("routes %s traffic to its own limiter", async (_name, method, url, expectedCheck) => {
    await serverEntry.fetch(new Request(url, { method }), {}, {});

    expect(expectedCheck).toHaveBeenCalledWith("203.0.113.1");
    const allChecks = [mocks.serverFnCheck, mocks.pdfCheck, mocks.monitoringCheck, mocks.ssrCheck];
    for (const check of allChecks) {
      expect(check).toHaveBeenCalledTimes(check === expectedCheck ? 1 : 0);
    }
  });

  it("returns 429 with Retry-After before dispatching a blocked request", async () => {
    mocks.serverFnCheck.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const response = await serverEntry.fetch(
      new Request("https://gpa.t00ls.dev/_serverFn/action", { method: "POST" }),
      {},
      {},
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mocks.handlerFetch).not.toHaveBeenCalled();
  });
});

describe("PDF upload", () => {
  it("rejects a declared body larger than 50 MB before storing it", async () => {
    const response = await serverEntry.fetch(
      new Request("https://gpa.t00ls.dev/api/pdf-download", {
        method: "POST",
        headers: {
          cookie: "session=valid",
          "content-length": String(50 * 1024 * 1024 + 1),
          "x-filename": "report.pdf",
        },
        body: new Uint8Array([1]),
      }),
      {},
      {},
    );

    expect(response.status).toBe(413);
    expect(mocks.storePdf).not.toHaveBeenCalled();
  });

  it("stores a body within the limit", async () => {
    const response = await serverEntry.fetch(
      new Request("https://gpa.t00ls.dev/api/pdf-download", {
        method: "POST",
        headers: { cookie: "session=valid", "x-filename": "report.pdf" },
        body: new Uint8Array([1, 2, 3]),
      }),
      {},
      {},
    );

    expect(response.status).toBe(200);
    expect(mocks.storePdf).toHaveBeenCalledWith("user-1", new Uint8Array([1, 2, 3]), "report.pdf");
  });
});

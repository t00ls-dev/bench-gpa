import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "./turnstile";

describe("verifyTurnstile", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    delete process.env.TURNSTILE_BYPASS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("bypasses when TURNSTILE_BYPASS is true", async () => {
    vi.stubEnv("TURNSTILE_BYPASS", "true");
    await expect(verifyTurnstile("any-token")).resolves.toBe(true);
  });

  it("returns false when secret key is missing", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifyTurnstile("token")).resolves.toBe(false);
  });

  it("returns true when Cloudflare responds success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    );
    await expect(verifyTurnstile("valid-token")).resolves.toBe(true);
  });

  it("returns false when Cloudflare responds failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false }),
      }),
    );
    await expect(verifyTurnstile("invalid-token")).resolves.toBe(false);
  });

  it("retries on fetch failure then returns false", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("still down")),
    );
    await expect(verifyTurnstile("token")).resolves.toBe(false);
  });

  it("recovers after first attempt failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstile("token")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes remoteip when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await verifyTurnstile("token", "1.2.3.4");
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("returns false on non-ok response after retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstile("token")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

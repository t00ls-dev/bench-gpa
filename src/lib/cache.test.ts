import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SimpleCache } from "./cache";

describe("SimpleCache", () => {
  let cache: SimpleCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new SimpleCache(10_000);
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  it("set and get", () => {
    cache.set("key", 42);
    expect(cache.get("key")).toBe(42);
  });

  it("returns undefined for missing key", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("deletes an entry", () => {
    cache.set("key", 42);
    cache.delete("key");
    expect(cache.get("key")).toBeUndefined();
  });

  it("does not restore an invalidated entry when an older load finishes", async () => {
    let resolve!: (value: string) => void;
    const load = cache.wrap(
      "key",
      () =>
        new Promise<string>((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );

    cache.delete("key");
    resolve("stale");

    await expect(load).resolves.toBe("stale");
    expect(cache.get("key")).toBeUndefined();
  });

  it("expires entry after TTL", () => {
    cache.set("key", "value", 5_000);
    vi.advanceTimersByTime(5_001);
    expect(cache.get("key")).toBeUndefined();
  });

  it("wrap executes fn and caches result", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const r1 = await cache.wrap("key", fn, 10_000);
    expect(r1).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);

    const r2 = await cache.wrap("key", fn, 10_000);
    expect(r2).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("wrap deduplicates concurrent in-flight requests", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const [r1, r2] = await Promise.all([
      cache.wrap("key", fn, 10_000),
      cache.wrap("key", fn, 10_000),
    ]);
    expect(r1).toBe("result");
    expect(r2).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("wrap executes fn again after expiry", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    await cache.wrap("key", fn, 5_000);
    vi.advanceTimersByTime(5_001);
    await cache.wrap("key", fn, 5_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("wrap does not cache if fn throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(cache.wrap("key", fn)).rejects.toThrow("fail");
    await expect(cache.wrap("key", fn)).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cleanup removes expired entries", () => {
    cache.set("a", 1, 5_000);
    cache.set("b", 2, 30_000);
    vi.advanceTimersByTime(15_000);
    cache.set("c", 3, 10_000);
    vi.advanceTimersByTime(10_001);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBeUndefined();
  });
});

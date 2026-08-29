import { describe, expect, it } from "vitest";
import {
  claimChunkReload,
  clearImportActive,
  consumeChunkReloadPending,
  getBrowserSessionStorage,
  handlePendingChunkReload,
  isChunkLoadError,
  isChunkReloadPending,
  isImportActive,
  markImportActive,
  markChunkReloadPending,
} from "./chunk-reload";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("claimChunkReload", () => {
  it("allows one recovery reload per release", () => {
    const storage = createStorage();

    expect(claimChunkReload(storage, "release-a")).toBe(true);
    expect(claimChunkReload(storage, "release-a")).toBe(false);
  });

  it("allows recovery again after a new release reaches the tab", () => {
    const storage = createStorage();

    expect(claimChunkReload(storage, "release-a")).toBe(true);
    expect(claimChunkReload(storage, "release-b")).toBe(true);
    expect(claimChunkReload(storage, "release-b")).toBe(false);
  });

  it("does not throw or risk a reload loop when storage is restricted", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => undefined,
    };

    expect(claimChunkReload(storage, "release-a")).toBe(false);
  });
});

describe("active import marker", () => {
  it("blocks reloads only while the marker is active", () => {
    const storage = createStorage();
    markImportActive(storage);

    expect(isImportActive(storage)).toBe(true);
    clearImportActive(storage);
    expect(isImportActive(storage)).toBe(false);
  });

  it("keeps the in-memory marker when browser storage is restricted", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(() => markImportActive(storage)).not.toThrow();
    expect(isImportActive(storage)).toBe(true);
    expect(() => clearImportActive(storage)).not.toThrow();
    expect(isImportActive(storage)).toBe(false);
  });
});

describe("chunk load error detection", () => {
  it.each([
    "Importing a module script failed.",
    "Failed to fetch dynamically imported module: /assets/page.js",
    "error loading dynamically imported module",
  ])("recognizes %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("does not classify unrelated failures", () => {
    expect(isChunkLoadError(new Error("Database unavailable"))).toBe(false);
  });

  it("suppresses only one chunk error after a recovery reload starts", () => {
    const error = new TypeError("Importing a module script failed.");
    markChunkReloadPending(error);

    expect(isChunkReloadPending(error)).toBe(true);
    expect(isChunkReloadPending(new TypeError(error.message))).toBe(false);
    expect(consumeChunkReloadPending(error)).toBe(true);
    expect(consumeChunkReloadPending(error)).toBe(false);
  });

  it("lets the boundary handle the error while preserving one later Sentry suppression", () => {
    const error = new TypeError("Importing a module script failed.");
    markChunkReloadPending(error);

    expect(handlePendingChunkReload(error)).toBe(true);
    expect(isChunkReloadPending(error)).toBe(false);
    expect(consumeChunkReloadPending(error)).toBe(true);
    expect(consumeChunkReloadPending(error)).toBe(false);
  });

  it("returns no browser storage during SSR", () => {
    expect(getBrowserSessionStorage()).toBeNull();
  });
});

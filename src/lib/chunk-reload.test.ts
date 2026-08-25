import { describe, expect, it } from "vitest";
import { claimChunkReload } from "./chunk-reload";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
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
});

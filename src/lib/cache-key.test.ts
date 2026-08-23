import { describe, expect, it } from "vitest";
import { buildCacheKey } from "./cache-key";

describe("buildCacheKey", () => {
  it("does not collide between a value containing commas and multiple values", () => {
    expect(buildCacheKey("filters", { values: ["A,B"] })).not.toBe(
      buildCacheKey("filters", { values: ["A", "B"] }),
    );
  });

  it("normalizes arrays whose order has no semantic meaning", () => {
    expect(buildCacheKey("filters", { values: ["B", "A"] })).toBe(
      buildCacheKey("filters", { values: ["A", "B"] }),
    );
  });
});

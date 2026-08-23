// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCT_STORE_CODES_STORAGE_KEY,
  sanitizeProductStoreCodes,
  useProductStoreCodes,
} from "@/hooks/use-product-store-codes";

describe("useProductStoreCodes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores a persisted multi-store selection", async () => {
    localStorage.setItem(PRODUCT_STORE_CODES_STORAGE_KEY, JSON.stringify(["1", "2"]));

    const { result } = renderHook(() => useProductStoreCodes());

    await waitFor(() => expect(result.current[0]).toEqual(["1", "2"]));
  });

  it("applies the URL store once over persistence and allows clearing afterward", async () => {
    localStorage.setItem(PRODUCT_STORE_CODES_STORAGE_KEY, JSON.stringify(["1", "2"]));
    const { result, rerender } = renderHook(
      ({ store }: { store?: string }) => useProductStoreCodes(store),
      { initialProps: { store: "9" } },
    );

    await waitFor(() => expect(result.current[0]).toEqual(["9"]));

    act(() => result.current[1]([]));
    rerender({ store: "10" });

    expect(result.current[0]).toEqual([]);
    await waitFor(() =>
      expect(localStorage.getItem(PRODUCT_STORE_CODES_STORAGE_KEY)).toBe(JSON.stringify([])),
    );
  });

  it("clears persisted stores for an all-store product deep link", async () => {
    localStorage.setItem(PRODUCT_STORE_CODES_STORAGE_KEY, JSON.stringify(["1", "2"]));

    const { result } = renderHook(() => useProductStoreCodes(undefined, true));

    await waitFor(() => expect(result.current[0]).toEqual([]));
  });
});

describe("sanitizeProductStoreCodes", () => {
  it("falls back to all stores for an invalid persisted value", () => {
    expect(sanitizeProductStoreCodes({ store: "1" } as unknown as string[])).toEqual([]);
  });

  it("removes empty and duplicate store codes", () => {
    expect(sanitizeProductStoreCodes(["1", "", "1", "2"])).toEqual(["1", "2"]);
  });
});

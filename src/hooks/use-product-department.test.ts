// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCT_DEPARTMENT_STORAGE_KEY,
  sanitizeProductDepartment,
  useProductDepartment,
} from "@/hooks/use-product-department";

describe("useProductDepartment", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores and updates the persisted department", async () => {
    localStorage.setItem(PRODUCT_DEPARTMENT_STORAGE_KEY, JSON.stringify("MERCEARIA"));

    const { result } = renderHook(() =>
      useProductDepartment({ productCode: undefined, isResolved: false }),
    );

    await waitFor(() => expect(result.current[0]).toBe("MERCEARIA"));

    act(() => result.current[1]("BAZAR"));

    await waitFor(() =>
      expect(localStorage.getItem(PRODUCT_DEPARTMENT_STORAGE_KEY)).toBe(JSON.stringify("BAZAR")),
    );
  });

  it("replaces persistence with the department resolved from the PLU", async () => {
    localStorage.setItem(PRODUCT_DEPARTMENT_STORAGE_KEY, JSON.stringify("MERCEARIA"));

    const { result } = renderHook(() =>
      useProductDepartment({
        productCode: "123",
        resolvedDepartment: "PERECIVEIS",
        isResolved: true,
      }),
    );

    await waitFor(() => expect(result.current[0]).toBe("PERECIVEIS"));
    expect(localStorage.getItem(PRODUCT_DEPARTMENT_STORAGE_KEY)).toBe(JSON.stringify("PERECIVEIS"));
  });

  it("clears persistence when the PLU has no unique department in the store scope", async () => {
    localStorage.setItem(PRODUCT_DEPARTMENT_STORAGE_KEY, JSON.stringify("MERCEARIA"));

    const { result } = renderHook(() =>
      useProductDepartment({
        productCode: "123",
        resolvedDepartment: null,
        isResolved: true,
      }),
    );

    await waitFor(() => expect(result.current[0]).toBeNull());
    expect(localStorage.getItem(PRODUCT_DEPARTMENT_STORAGE_KEY)).toBe("null");
  });
});

describe("sanitizeProductDepartment", () => {
  it("normalizes valid values and rejects malformed persistence", () => {
    expect(sanitizeProductDepartment("  MERCEARIA  ")).toBe("MERCEARIA");
    expect(sanitizeProductDepartment(" ")).toBeNull();
    expect(sanitizeProductDepartment(["MERCEARIA"] as unknown as string)).toBeNull();
  });
});

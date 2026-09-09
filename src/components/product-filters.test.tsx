// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ProductFilters } from "./product-filters";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("ProductFilters", () => {
  it("selects one department", () => {
    const onDepartmentChange = vi.fn();
    render(
      <ProductFilters
        stores={[]}
        departments={["BAZAR", "MERCEARIA"]}
        storeCodes={[]}
        department={null}
        onStoreCodesChange={vi.fn()}
        onDepartmentChange={onDepartmentChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Departamento" }));
    fireEvent.click(screen.getByRole("option", { name: "MERCEARIA" }));

    expect(onDepartmentChange).toHaveBeenCalledWith("MERCEARIA");
  });

  it("clears the department when stores change", () => {
    const onStoreCodesChange = vi.fn();
    const onDepartmentChange = vi.fn();
    render(
      <ProductFilters
        stores={[{ store_code: "1516", store_name: "Loja Centro" }]}
        departments={["MERCEARIA"]}
        storeCodes={[]}
        department="MERCEARIA"
        onStoreCodesChange={onStoreCodesChange}
        onDepartmentChange={onDepartmentChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Loja" }));
    fireEvent.click(screen.getByRole("option", { name: "1516 - Loja Centro" }));

    expect(onStoreCodesChange).toHaveBeenCalledWith(["1516"]);
    expect(onDepartmentChange).toHaveBeenCalledWith(null);
  });

  it("preserves the current product scope when stores change without a department", () => {
    const onDepartmentChange = vi.fn();
    render(
      <ProductFilters
        stores={[{ store_code: "1516", store_name: "Loja Centro" }]}
        departments={[]}
        storeCodes={[]}
        department={null}
        onStoreCodesChange={vi.fn()}
        onDepartmentChange={onDepartmentChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Loja" }));
    fireEvent.click(screen.getByRole("option", { name: "1516 - Loja Centro" }));

    expect(onDepartmentChange).not.toHaveBeenCalled();
  });
});

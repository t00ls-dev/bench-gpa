// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SavedAreaProductPicker } from "./saved-area-product-picker";

describe("SavedAreaProductPicker", () => {
  it("limits visible results, keeps selected products first, and toggles selection", () => {
    const onChange = vi.fn();
    const options = Array.from({ length: 101 }, (_, index) => ({
      value: String(index + 1),
      label: `PLU ${index + 1} · Produto ${index + 1}`,
    }));

    render(
      <SavedAreaProductPicker
        options={options}
        value={["101"]}
        onChange={onChange}
        loading={false}
      />,
    );

    expect(screen.getByText("Exibindo 100 de 101")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("PLU 101");

    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("finds products by description without rendering the full option set", () => {
    render(
      <SavedAreaProductPicker
        options={[
          { value: "100", label: "PLU 100 · Arroz" },
          { value: "200", label: "PLU 200 · Feijão" },
        ]}
        value={[]}
        onChange={vi.fn()}
        loading={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Buscar produtos para a análise"), {
      target: { value: "feijão" },
    });

    expect(screen.getByRole("option")).toHaveTextContent("PLU 200 · Feijão");
    expect(screen.queryByText("PLU 100 · Arroz")).toBeNull();
  });
});

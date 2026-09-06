// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductSearch } from "./product-search";

const suggestion = { prod_code: "1008160", prod_name: "LEITE UHT INTEGRAL" };

function renderSearch(storeCount: number, onSelect = vi.fn()) {
  render(
    <ProductSearch
      query="leite int"
      debounced="leite int"
      selected={null}
      suggestions={[suggestion]}
      searchFetching={false}
      storeCount={storeCount}
      onQueryChange={vi.fn()}
      onSelect={onSelect}
      onClear={vi.fn()}
    />,
  );
  return onSelect;
}

describe("ProductSearch", () => {
  it("explains that multiple selected stores use any-store matching", () => {
    renderSearch(2);

    expect(
      screen.getByText("Resultados com venda registrada em qualquer uma das lojas selecionadas."),
    ).toBeInTheDocument();
  });

  it("shows and selects a result matched by partial terms", () => {
    const onSelect = renderSearch(1);

    fireEvent.click(screen.getByRole("button", { name: /1008160.*LEITE UHT INTEGRAL/i }));
    expect(onSelect).toHaveBeenCalledWith(suggestion);
  });
});

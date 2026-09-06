// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductSearch } from "./product-search";

const suggestion = { prod_code: "1008160", prod_name: "LEITE UHT INTEGRAL" };

function renderSearch(onSelect = vi.fn()) {
  render(
    <ProductSearch
      query="leite int"
      debounced="leite int"
      selected={null}
      suggestions={[suggestion]}
      searchFetching={false}
      onQueryChange={vi.fn()}
      onSelect={onSelect}
      onClear={vi.fn()}
    />,
  );
  return onSelect;
}

describe("ProductSearch", () => {
  it("keeps the original name-or-code search prompt", () => {
    renderSearch();

    expect(
      screen.getByPlaceholderText("Digite ao menos 3 caracteres (nome ou código)…"),
    ).toBeInTheDocument();
  });

  it("shows and selects a result matched by partial terms", () => {
    const onSelect = renderSearch();

    fireEvent.click(screen.getByRole("button", { name: /1008160.*LEITE UHT INTEGRAL/i }));
    expect(onSelect).toHaveBeenCalledWith(suggestion);
  });
});

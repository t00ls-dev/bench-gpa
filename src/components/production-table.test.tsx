// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductionTable } from "./production-table";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { fmtBRL } from "@/lib/utils";

// fmtBRL uses a non-breaking space between "R$" and the number.
// testing-library's default text normalizer collapses that into a regular
// space before comparing, so a plain string match against fmtBRL()'s raw
// output never finds it. Compares raw textContent instead, sidestepping
// the mismatch entirely.
const exactText = (text: string) => (_: string, el: Element | null) => el?.textContent === text;

const VAL_INDIVIDUAL = 500;
const VAL_OUTROS = 90;
const VAL_TOTAL_SECAO = VAL_INDIVIDUAL + VAL_OUTROS;

const SECOES: ProductionSecaoForecast[] = [
  {
    secao: "CARNES E AVES",
    produtos: [
      {
        prodCode: "1",
        prodName: "PICANHA",
        secao: "CARNES E AVES",
        occurrences: 6,
        forecastVal: VAL_INDIVIDUAL,
        forecastMin: 380,
        forecastMax: 610,
      },
    ],
    outrosVal: VAL_OUTROS,
    outrosNumProdutos: 3,
    totalSecao: VAL_TOTAL_SECAO,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    outrosVal: 0,
    outrosNumProdutos: 0,
    totalSecao: 0,
  },
];

describe("ProductionTable", () => {
  it("shows every section, including one with no products at all", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText("CARNES E AVES")).toBeInTheDocument();
    expect(screen.getByText("BACALHAU")).toBeInTheDocument();
  });

  it("reconciles: section total equals individual products plus outros", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    // The section header's total matches individual + outros by
    // construction (totalSecao is computed in production.functions.ts,
    // not recomputed by the component -- this just checks the render is
    // faithful to what it was given).
    expect(screen.getAllByText(exactText(fmtBRL(VAL_TOTAL_SECAO))).length).toBeGreaterThan(0);
    expect(screen.getByText(exactText(fmtBRL(VAL_INDIVIDUAL)))).toBeInTheDocument();
    expect(screen.getByText(exactText(fmtBRL(VAL_OUTROS)))).toBeInTheDocument();
  });

  it("doesn't render an 'outros' line when there's nothing to aggregate", () => {
    render(<ProductionTable secoes={[SECOES[1]]} isFetching={false} />);
    expect(screen.queryByText(/outros produtos/i)).not.toBeInTheDocument();
  });

  it("shows the empty-state message when there are no sections at all", () => {
    render(<ProductionTable secoes={[]} isFetching={false} />);
    expect(
      screen.getByText("Nenhuma seção de Perecíveis encontrada para esta loja."),
    ).toBeInTheDocument();
  });

  it("shows the min/max range under the average for an individual product", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(
      screen.getByText(exactText(`mín ${fmtBRL(380)} / máx ${fmtBRL(610)}`)),
    ).toBeInTheDocument();
  });

  describe("productFilter", () => {
    it("keeps only products matching the search, by name or code", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="picanha" />);
      expect(screen.getByText("PICANHA")).toBeInTheDocument();
      expect(screen.queryByText("BACALHAU")).not.toBeInTheDocument();
    });

    it("matches by product code too, case-insensitively", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="1" />);
      expect(screen.getByText("PICANHA")).toBeInTheDocument();
    });

    it("hides a section with no product matching an active search", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="xyz-nada" />);
      expect(screen.queryByText("CARNES E AVES")).not.toBeInTheDocument();
      expect(screen.queryByText("BACALHAU")).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum produto encontrado para "xyz-nada".')).toBeInTheDocument();
    });

    it("shows every section again once the search is cleared", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="" />);
      expect(screen.getByText("CARNES E AVES")).toBeInTheDocument();
      expect(screen.getByText("BACALHAU")).toBeInTheDocument();
    });

    it("drops 'outros' and recomputes the totals from just the visible rows while filtering", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="picanha" />);
      // Outros (R$90) isn't attributable to a product name, so it's excluded
      // while a search is active -- the section and overall total should
      // both equal PICANHA alone (R$500), not the unfiltered R$590.
      expect(screen.queryByText(/outros produtos/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(exactText(fmtBRL(VAL_INDIVIDUAL))).length).toBeGreaterThan(1);
      expect(screen.queryByText(exactText(fmtBRL(VAL_TOTAL_SECAO)))).not.toBeInTheDocument();
    });

    it("shows a R$0 total when nothing matches the search", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter="xyz-nada" />);
      expect(screen.getByText(exactText(`Total: ${fmtBRL(0)}`))).toBeInTheDocument();
    });
  });
});

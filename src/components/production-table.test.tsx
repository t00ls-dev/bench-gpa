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
});

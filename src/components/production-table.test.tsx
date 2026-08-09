// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductionTable } from "./production-table";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { fmtBRL } from "@/lib/utils";
import { OUTROS_CAVEAT_TEXT } from "@/lib/production-filter";

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
        grupo: "BOVINOS",
        subgrupo: "CORTES NOBRES",
        occurrences: 6,
        forecastVal: VAL_INDIVIDUAL,
        forecastMin: 380,
        forecastMax: 610,
      },
    ],
    outrosBySubgrupo: [
      { grupo: "BOVINOS", subgrupo: "CORTES NOBRES", numProdutos: 3, outrosVal: VAL_OUTROS },
    ],
    totalSecao: VAL_TOTAL_SECAO,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    outrosBySubgrupo: [],
    totalSecao: 0,
  },
];

describe("ProductionTable", () => {
  it("shows every section, including one with no products at all", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText("CARNES E AVES")).toBeInTheDocument();
    expect(screen.getByText("BACALHAU")).toBeInTheDocument();
  });

  it("does not render Grupo/Subgrupo as their own header rows -- only the leaf product", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.queryByText("BOVINOS")).not.toBeInTheDocument();
    expect(screen.queryByText("CORTES NOBRES")).not.toBeInTheDocument();
  });

  it("reconciles: section total equals individual products plus outros", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
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

  it("shows the PLU alongside the product name", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText(exactText("PLU 1 · PICANHA"))).toBeInTheDocument();
  });

  it("shows a caveat explaining why 'outros' has no individual PLU, instead of just hiding it", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText(exactText(OUTROS_CAVEAT_TEXT))).toBeInTheDocument();
  });

  describe("export PDF button", () => {
    it("doesn't render without an onExportPDF handler", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} />);
      expect(screen.queryByRole("button", { name: /exportar planejamento em pdf/i })).toBeNull();
    });

    it("doesn't render when there's no data loaded yet", () => {
      render(<ProductionTable secoes={[]} isFetching={false} onExportPDF={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /exportar planejamento em pdf/i })).toBeNull();
    });

    it("calls onExportPDF when clicked", () => {
      const onExportPDF = vi.fn();
      render(<ProductionTable secoes={SECOES} isFetching={false} onExportPDF={onExportPDF} />);
      fireEvent.click(screen.getByRole("button", { name: /exportar planejamento em pdf/i }));
      expect(onExportPDF).toHaveBeenCalledTimes(1);
    });

    it("shows the elapsed time and disables the button while generating", () => {
      render(
        <ProductionTable
          secoes={SECOES}
          isFetching={false}
          onExportPDF={vi.fn()}
          pdfLoading
          pdfElapsed={3}
        />,
      );
      const button = screen.getByRole("button", { name: /exportar planejamento em pdf/i });
      expect(button).toBeDisabled();
      expect(screen.getByText("Gerando… 3s")).toBeInTheDocument();
    });
  });

  describe("productFilter", () => {
    it("keeps only the selected products", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["1"]} />);
      expect(screen.getByText(exactText("PLU 1 · PICANHA"))).toBeInTheDocument();
      expect(screen.queryByText("BACALHAU")).not.toBeInTheDocument();
    });

    it("hides a section with no selected product in it", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["nada-aqui"]} />);
      expect(screen.queryByText("CARNES E AVES")).not.toBeInTheDocument();
      expect(screen.queryByText("BACALHAU")).not.toBeInTheDocument();
      expect(
        screen.getByText("Nenhum produto encontrado para os filtros selecionados."),
      ).toBeInTheDocument();
    });

    it("shows every section again once the selection is cleared", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={[]} />);
      expect(screen.getByText("CARNES E AVES")).toBeInTheDocument();
      expect(screen.getByText("BACALHAU")).toBeInTheDocument();
    });

    it("drops 'outros' and recomputes the totals from just the visible rows while filtering", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["1"]} />);
      expect(screen.queryByText(/outros produtos/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(exactText(fmtBRL(VAL_INDIVIDUAL))).length).toBeGreaterThan(1);
      expect(screen.queryByText(exactText(fmtBRL(VAL_TOTAL_SECAO)))).not.toBeInTheDocument();
    });

    it("shows a R$0 total when nothing matches the selection", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["nada-aqui"]} />);
      expect(screen.getAllByText(exactText(`Total: ${fmtBRL(0)}`)).length).toBeGreaterThan(0);
    });
  });

  describe("subgrupoFilter", () => {
    it("keeps only the selected subgrupo, INCLUDING its outros", () => {
      render(
        <ProductionTable secoes={SECOES} isFetching={false} subgrupoFilter={["CORTES NOBRES"]} />,
      );
      expect(screen.getByText(exactText("PLU 1 · PICANHA"))).toBeInTheDocument();
      expect(screen.getByText(exactText(fmtBRL(VAL_OUTROS)))).toBeInTheDocument();
    });

    it("hides a section with no matching subgrupo", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} subgrupoFilter={["nada-aqui"]} />);
      expect(screen.queryByText("CARNES E AVES")).not.toBeInTheDocument();
    });
  });
});

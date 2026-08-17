// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductionTable } from "./production-table";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { fmtBRL } from "@/lib/utils";

// fmtBRL uses a non-breaking space between "R$" and the number.
// testing-library's default text normalizer collapses that into a regular
// space before comparing, so a plain string match against fmtBRL()'s raw
// output never finds it. Compares raw textContent instead, sidestepping
// the mismatch entirely.
const exactText = (text: string) => (_: string, el: Element | null) => el?.textContent === text;

const VAL_A = 500;
const VAL_B = 90;
const VAL_TOTAL_SECAO = VAL_A + VAL_B;

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
        forecastVal: VAL_A,
        forecastMin: 380,
        forecastMax: 610,
      },
      {
        // A product with a single occurrence: min === val === max, a real
        // single data point shown as-is (no confidence floor anymore).
        prodCode: "2",
        prodName: "COSTELA",
        secao: "CARNES E AVES",
        grupo: "BOVINOS",
        subgrupo: "CORTES NOBRES",
        occurrences: 1,
        forecastVal: VAL_B,
        forecastMin: VAL_B,
        forecastMax: VAL_B,
      },
    ],
    totalSecao: VAL_TOTAL_SECAO,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    totalSecao: 0,
  },
];

describe("ProductionTable", () => {
  it("shows the flat table header and the new title", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText("Previsão de venda")).toBeInTheDocument();
    expect(screen.getByText("PLU")).toBeInTheDocument();
    expect(screen.getByText("Produto")).toBeInTheDocument();
    expect(screen.getByText("Mín")).toBeInTheDocument();
    expect(screen.getByText("Méd")).toBeInTheDocument();
    expect(screen.getByText("Máx")).toBeInTheDocument();
  });

  it("does not render section, grupo or subgrupo headers in the body", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.queryByText("CARNES E AVES")).not.toBeInTheDocument();
    expect(screen.queryByText("BACALHAU")).not.toBeInTheDocument();
    expect(screen.queryByText("BOVINOS")).not.toBeInTheDocument();
    expect(screen.queryByText("CORTES NOBRES")).not.toBeInTheDocument();
  });

  it("shows every product individually with separate min/med/max columns", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText(exactText("1"))).toBeInTheDocument();
    expect(screen.getByText(exactText("PICANHA"))).toBeInTheDocument();
    expect(screen.getByText(exactText("2"))).toBeInTheDocument();
    expect(screen.getByText(exactText("COSTELA"))).toBeInTheDocument();
    expect(screen.queryByText(/outros produtos/i)).not.toBeInTheDocument();
  });

  it("shows min === val === max for a product with a single occurrence", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getAllByText(exactText(fmtBRL(VAL_B)))).toHaveLength(3);
  });

  it("reconciles the total from the visible products", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(
      screen.getAllByText((_, el) => el?.textContent === `Total: ${fmtBRL(VAL_TOTAL_SECAO)}`),
    ).not.toHaveLength(0);
    expect(screen.getByText(exactText(fmtBRL(VAL_A)))).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no sections at all", () => {
    render(<ProductionTable secoes={[]} isFetching={false} />);
    expect(
      screen.getByText("Nenhuma seção de Perecíveis encontrada para esta loja."),
    ).toBeInTheDocument();
  });

  it("shows the three value columns for a product", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText(exactText(fmtBRL(380)))).toBeInTheDocument();
    expect(screen.getByText(exactText(fmtBRL(500)))).toBeInTheDocument();
    expect(screen.getByText(exactText(fmtBRL(610)))).toBeInTheDocument();
  });

  it("shows PLU and product name in separate cells", () => {
    render(<ProductionTable secoes={SECOES} isFetching={false} />);
    expect(screen.getByText(exactText("1"))).toBeInTheDocument();
    expect(screen.getByText(exactText("PICANHA"))).toBeInTheDocument();
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
      expect(screen.getByText(exactText("PICANHA"))).toBeInTheDocument();
      expect(screen.queryByText(exactText("COSTELA"))).not.toBeInTheDocument();
    });

    it("shows the empty state when nothing matches", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["nada-aqui"]} />);
      expect(
        screen.getByText("Nenhum produto encontrado para os filtros selecionados."),
      ).toBeInTheDocument();
    });

    it("shows every product again once the selection is cleared", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={[]} />);
      expect(screen.getByText(exactText("PICANHA"))).toBeInTheDocument();
      expect(screen.getByText(exactText("COSTELA"))).toBeInTheDocument();
    });

    it("recomputes the totals from just the visible rows while filtering", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["1"]} />);
      expect(screen.getByText(exactText(fmtBRL(VAL_A)))).toBeInTheDocument();
      expect(
        screen.getAllByText((_, el) => el?.textContent === `Total: ${fmtBRL(VAL_A)}`),
      ).not.toHaveLength(0);
      expect(
        screen.queryAllByText((_, el) => el?.textContent === `Total: ${fmtBRL(VAL_TOTAL_SECAO)}`),
      ).toHaveLength(0);
    });

    it("shows a R$0 total when nothing matches the selection", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} productFilter={["nada-aqui"]} />);
      expect(screen.getAllByText(exactText(`Total: ${fmtBRL(0)}`)).length).toBeGreaterThan(0);
    });
  });

  describe("subgrupoFilter", () => {
    it("keeps only the selected subgrupo's products", () => {
      render(
        <ProductionTable secoes={SECOES} isFetching={false} subgrupoFilter={["CORTES NOBRES"]} />,
      );
      expect(screen.getByText(exactText("PICANHA"))).toBeInTheDocument();
    });

    it("shows the empty state when nothing matches the subgrupo", () => {
      render(<ProductionTable secoes={SECOES} isFetching={false} subgrupoFilter={["nada-aqui"]} />);
      expect(
        screen.getByText("Nenhum produto encontrado para os filtros selecionados."),
      ).toBeInTheDocument();
    });
  });
});

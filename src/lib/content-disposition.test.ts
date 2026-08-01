import { describe, expect, it } from "vitest";
import { contentDispositionHeader } from "./content-disposition";

describe("contentDispositionHeader", () => {
  it("nome ASCII simples: fallback e filename* iguais", () => {
    expect(contentDispositionHeader("relatorio.pdf")).toBe(
      `attachment; filename="relatorio.pdf"; filename*=UTF-8''relatorio.pdf`,
    );
  });

  it("nome com acento: fallback vira _, filename* carrega o UTF-8 percent-encoded", () => {
    const header = contentDispositionHeader("análise-área-açúcar.pdf");
    expect(header).toContain('filename="an_lise-_rea-a__car.pdf"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("análise-área-açúcar.pdf")}`);
  });

  it("remove aspas duplas do fallback (não deixa o header vazar pra fora do campo)", () => {
    const header = contentDispositionHeader('relatorio"malicioso.pdf');
    expect(header).toContain('filename="relatoriomalicioso.pdf"');
  });
});

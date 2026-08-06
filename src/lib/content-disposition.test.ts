import { describe, expect, it } from "vitest";
import { contentDispositionHeader } from "./content-disposition";

describe("contentDispositionHeader", () => {
  it("simple ASCII name: fallback and filename* match", () => {
    expect(contentDispositionHeader("relatorio.pdf")).toBe(
      `attachment; filename="relatorio.pdf"; filename*=UTF-8''relatorio.pdf`,
    );
  });

  it("accented name: fallback becomes _, filename* carries the percent-encoded UTF-8", () => {
    const header = contentDispositionHeader("análise-área-açúcar.pdf");
    expect(header).toContain('filename="an_lise-_rea-a__car.pdf"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("análise-área-açúcar.pdf")}`);
  });

  it("removes double quotes from the fallback (doesn't let the header leak out of the field)", () => {
    const header = contentDispositionHeader('relatorio"malicioso.pdf');
    expect(header).toContain('filename="relatoriomalicioso.pdf"');
  });
});

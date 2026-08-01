// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";
import { openPdfBlob, slugifyFilename } from "./export-pdf";

function createMockDoc(): jsPDF {
  return {
    output: vi.fn(() => new Blob(["mock-pdf"])),
  } as unknown as jsPDF;
}

describe("openPdfBlob", () => {
  let mockDoc: ReturnType<typeof createMockDoc>;
  let anchorEl: HTMLAnchorElement;

  beforeEach(() => {
    mockDoc = createMockDoc();
    anchorEl = document.createElement("a");
    vi.spyOn(document, "createElement").mockReturnValue(anchorEl);
    vi.spyOn(anchorEl, "click");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("calls doc.output with blob", () => {
    openPdfBlob(mockDoc);
    expect(mockDoc.output).toHaveBeenCalledWith("blob");
  });

  it("creates an anchor element", () => {
    openPdfBlob(mockDoc);
    expect(document.createElement).toHaveBeenCalledWith("a");
  });

  it("sets anchor href to blob URL", () => {
    openPdfBlob(mockDoc);
    expect(anchorEl.href).toBe("blob:mock");
  });

  it("sets anchor target and rel", () => {
    openPdfBlob(mockDoc);
    expect(anchorEl.target).toBe("_blank");
    expect(anchorEl.rel).toBe("noopener noreferrer");
  });

  it("clicks the anchor", () => {
    openPdfBlob(mockDoc);
    expect(anchorEl.click).toHaveBeenCalledTimes(1);
  });

  it("revokes blob URL after 10s", () => {
    openPdfBlob(mockDoc);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  // Sem nome, mantém o comportamento antigo (abre em nova aba) — `download`
  // faria o browser baixar direto em vez de abrir o preview.
  it("does not set download when no filename is given", () => {
    openPdfBlob(mockDoc);
    expect(anchorEl.download).toBe("");
    expect(anchorEl.target).toBe("_blank");
  });

  it("sets the download attribute when a filename is given", () => {
    openPdfBlob(mockDoc, "analise-area-mercearia-2026-07-14-a-2026-07-20.pdf");
    expect(anchorEl.download).toBe("analise-area-mercearia-2026-07-14-a-2026-07-20.pdf");
  });

  // Firefox só respeita `download` se o <a> estiver anexado ao documento no
  // momento do clique — fora do DOM, ele cai pro comportamento padrão de
  // navegação e salva com um nome genérico (hash/UUID) em vez de `filename`.
  // Chrome tolera clicar num elemento solto, por isso o bug passava
  // despercebido nos dois testes acima (que só checam a chamada, não o DOM).
  it("anexa o anchor ao documento antes de clicar (bug de nome de arquivo no Firefox)", () => {
    let connectedAtClickTime: boolean | undefined;
    vi.spyOn(anchorEl, "click").mockImplementation(() => {
      connectedAtClickTime = anchorEl.isConnected;
    });

    openPdfBlob(mockDoc, "relatorio.pdf");

    expect(connectedAtClickTime).toBe(true);
  });

  it("remove o anchor do documento logo depois do clique", () => {
    openPdfBlob(mockDoc, "relatorio.pdf");
    expect(anchorEl.isConnected).toBe(false);
  });
});

describe("slugifyFilename", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyFilename("Loja 1516 - LEBLON")).toBe("loja-1516-leblon");
  });

  it("removes accents", () => {
    expect(slugifyFilename("AÇÚCAR E PADARIA")).toBe("acucar-e-padaria");
  });

  it("collapses separators like › into a single hyphen", () => {
    expect(slugifyFilename("Loja 1516 - LEBLON › Mercearia")).toBe("loja-1516-leblon-mercearia");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyFilename("  Todas as lojas  ")).toBe("todas-as-lojas");
  });
});

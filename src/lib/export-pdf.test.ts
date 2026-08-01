// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";
import { slugifyFilename } from "./export-pdf";

function createMockDoc(): jsPDF {
  return {
    output: vi.fn(() => new Blob(["mock-pdf"], { type: "application/pdf" })),
  } as unknown as jsPDF;
}

// openPdfBlob reusa um anchor de preview único, criado uma vez no módulo (ver
// export-pdf.ts). vi.resetModules() + import dinâmico dá a cada teste um
// módulo fresco, sem esse estado vazando de um teste pro outro.
async function freshOpenPdfBlob() {
  vi.resetModules();
  const mod = await import("./export-pdf");
  return mod.openPdfBlob;
}

function getAnchor(): HTMLAnchorElement {
  const a = document.body.querySelector("a");
  if (!a) throw new Error("nenhum <a> encontrado no documento");
  return a;
}

describe("openPdfBlob: sem filename (preview numa aba nova)", () => {
  let mockDoc: ReturnType<typeof createMockDoc>;

  beforeEach(() => {
    mockDoc = createMockDoc();
    document.body.innerHTML = "";
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("nunca chama fetch, preview fica só no cliente, sem passar pelo servidor", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cria um anchor com blob: URL, target=_blank, sem download", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    const anchor = getAnchor();
    expect(anchor.href).toBe("blob:mock");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(anchor.hasAttribute("download")).toBe(false);
  });

  it("dispara um clique de verdade (dispatchEvent) com o anchor conectado ao documento", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc); // primeira chamada cria o anchor
    const anchor = getAnchor();
    let connectedAtClickTime: boolean | undefined;
    let receivedEvent: MouseEvent | undefined;
    anchor.addEventListener("click", (e) => {
      connectedAtClickTime = anchor.isConnected;
      receivedEvent = e as MouseEvent;
    });

    await openPdfBlob(mockDoc);

    expect(connectedAtClickTime).toBe(true);
    expect(receivedEvent).toBeInstanceOf(MouseEvent);
  });

  it("reusa o mesmo anchor entre chamadas em vez de criar um novo a cada preview", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    const first = getAnchor();
    await openPdfBlob(mockDoc);
    expect(document.body.querySelectorAll("a")).toHaveLength(1);
    expect(getAnchor()).toBe(first);
  });

  it("revokes blob URL after 10s", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});

describe("openPdfBlob: com filename (download forçado via servidor)", () => {
  let mockDoc: ReturnType<typeof createMockDoc>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDoc = createMockDoc();
    document.body.innerHTML = "";
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/api/pdf-download/tok-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL");
    // window.location.href não é navegável no jsdom: sobrescreve pra
    // conseguir espionar sem o "Not implemented: navigation" do jsdom.
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regressão do bug real: blob: URL + atributo `download` não é confiável
  // no gerenciador de download do Firefox (cai pro UUID da própria blob URL
  // como nome, Mozilla Bugzilla #1282407), mesmo com o anchor conectado ao
  // DOM e um MouseEvent de verdade disparado (as duas correções anteriores).
  // Por isso o caminho de filename não cria blob: URL nem anchor nenhum.
  // vai inteiro via POST pro servidor, que devolve Content-Disposition real.
  it("não cria nenhuma blob: URL nem anchor, vai direto pro servidor", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc, "relatorio.pdf");
    expect(document.body.querySelector("a")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("faz POST pra /api/pdf-download com o blob no corpo e o filename no header", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc, "analise-area-mercearia-2026-07-14-a-2026-07-20.pdf");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pdf-download",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-filename": encodeURIComponent("analise-area-mercearia-2026-07-14-a-2026-07-20.pdf"),
        },
        body: expect.any(Blob),
      }),
    );
  });

  it("navega (window.location.href) pra URL de download devolvida pelo servidor", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc, "relatorio.pdf");
    expect(window.location.href).toBe("/api/pdf-download/tok-123");
  });

  it("lança um erro claro se o POST falhar, sem navegar", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const openPdfBlob = await freshOpenPdfBlob();
    await expect(openPdfBlob(mockDoc, "relatorio.pdf")).rejects.toThrow(
      "Falha ao preparar o download do PDF.",
    );
    expect(window.location.href).toBe("");
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

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";
import { slugifyFilename } from "./export-pdf";

function createMockDoc(): jsPDF {
  return {
    output: vi.fn(() => new Blob(["mock-pdf"])),
  } as unknown as jsPDF;
}

// openPdfBlob agora reusa um anchor único, criado uma vez no módulo (ver
// export-pdf.ts) — vi.resetModules() + import dinâmico dá a cada teste um
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

describe("openPdfBlob", () => {
  let mockDoc: ReturnType<typeof createMockDoc>;

  beforeEach(() => {
    mockDoc = createMockDoc();
    document.body.innerHTML = "";
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("calls doc.output with blob", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    expect(mockDoc.output).toHaveBeenCalledWith("blob");
  });

  it("creates a single anchor element, appended to the document", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    expect(getAnchor().isConnected).toBe(true);
  });

  it("sets anchor href to blob URL", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    expect(getAnchor().href).toBe("blob:mock");
  });

  // Sem nome, mantém o comportamento antigo (abre em nova aba) — `download`
  // faria o browser baixar direto em vez de abrir o preview.
  it("sets anchor target and rel when no filename is given", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    const anchor = getAnchor();
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(anchor.download).toBe("");
  });

  it("sets the download attribute when a filename is given, clearing target/rel", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc, "analise-area-mercearia-2026-07-14-a-2026-07-20.pdf");
    const anchor = getAnchor();
    expect(anchor.download).toBe("analise-area-mercearia-2026-07-14-a-2026-07-20.pdf");
    expect(anchor.hasAttribute("target")).toBe(false);
    expect(anchor.hasAttribute("rel")).toBe(false);
  });

  // O anchor é reusado entre chamadas (não recriado) — um atributo deixado
  // por uma chamada anterior não pode vazar pra próxima.
  it("clears the download attribute on a later call without filename", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc, "relatorio.pdf");
    openPdfBlob(mockDoc);
    const anchor = getAnchor();
    expect(anchor.hasAttribute("download")).toBe(false);
    expect(anchor.target).toBe("_blank");
  });

  // `a.click()` (o método nativo) não é confiável no Firefox recente pra
  // disparar o download — o fix dispara um MouseEvent completo via
  // dispatchEvent, que ainda ativa o comportamento padrão do link (baixar
  // com o `download`) igual um clique real dispararia. Testado via um
  // listener de "click" de verdade, não espionando `.click()` (que não é
  // mais chamado).
  it("dispara um evento de click de verdade no anchor a cada chamada", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc); // primeira chamada cria o anchor
    const anchor = getAnchor();
    let clickEvents = 0;
    anchor.addEventListener("click", () => clickEvents++);

    openPdfBlob(mockDoc);

    expect(clickEvents).toBe(1);
  });

  it("revokes blob URL after 10s", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  // Regressão do bug de nome de arquivo genérico no Firefox: o Firefox só
  // honra `download` se o <a> estiver conectado ao documento no momento do
  // clique. Um anchor criado/anexado/removido na mesma chamada (a versão
  // anterior deste fix) ainda falhava em alguns casos — o padrão persistente
  // (criado uma vez, nunca removido) é o documentado como confiável entre
  // navegadores para download programático.
  it("o anchor está conectado ao documento no momento do clique", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc); // garante que o anchor já existe
    const anchor = getAnchor();
    let connectedAtClickTime: boolean | undefined;
    anchor.addEventListener("click", () => {
      connectedAtClickTime = anchor.isConnected;
    });

    openPdfBlob(mockDoc, "relatorio.pdf");

    expect(connectedAtClickTime).toBe(true);
  });

  // Discrimina de verdade `.click()` de `dispatchEvent`: no jsdom, `.click()`
  // NÃO passa pelo método `dispatchEvent` da instância (confirmado à parte,
  // monkey-patchando o método antes de chamar `.click()` — não disparou), só
  // um listener de "click" comum não seria capaz de distinguir os dois,
  // porque `.click()` também dispara um evento observável por listener.
  it("usa dispatchEvent (não `.click()`) — regressão que fica sem detecção só com listener", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc); // garante que o anchor já existe
    const anchor = getAnchor();
    const dispatchSpy = vi.spyOn(anchor, "dispatchEvent");

    openPdfBlob(mockDoc);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as MouseEvent;
    expect(event).toBeInstanceOf(MouseEvent);
    expect(event.type).toBe("click");
    expect(event.bubbles).toBe(true);
    expect(event.cancelable).toBe(true);
  });

  it("mantém o anchor no documento depois do clique — não remove, reusa na próxima chamada", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc);
    expect(getAnchor().isConnected).toBe(true);
  });

  it("reusa o mesmo elemento entre chamadas em vez de criar um novo a cada export", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    openPdfBlob(mockDoc, "primeiro.pdf");
    const first = getAnchor();

    openPdfBlob(mockDoc, "segundo.pdf");

    expect(document.body.querySelectorAll("a")).toHaveLength(1);
    expect(getAnchor()).toBe(first);
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

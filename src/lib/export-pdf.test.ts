// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";
import { slugifyFilename } from "./export-pdf";

function createMockDoc(): jsPDF {
  return {
    output: vi.fn(() => new Blob(["mock-pdf"], { type: "application/pdf" })),
  } as unknown as jsPDF;
}

// openPdfBlob reuses a single preview anchor, created once at the module
// level (see export-pdf.ts). vi.resetModules() + dynamic import gives each
// test a fresh module, without that state leaking from one test to another.
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

describe("openPdfBlob: without filename (preview in a new tab)", () => {
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

  it("never calls fetch, preview stays entirely client-side, without going through the server", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates an anchor with a blob: URL, target=_blank, no download attribute", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc);
    const anchor = getAnchor();
    expect(anchor.href).toBe("blob:mock");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(anchor.hasAttribute("download")).toBe(false);
  });

  it("fires a real click (dispatchEvent) with the anchor connected to the document", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc); // first call creates the anchor
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

  it("reuses the same anchor across calls instead of creating a new one on every preview", async () => {
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

describe("openPdfBlob: with filename (forced download via server)", () => {
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
    // window.location.href isn't navigable in jsdom: overrides it so we
    // can spy on it without jsdom's "Not implemented: navigation".
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regression from a real bug: blob: URL + the `download` attribute
  // isn't reliable in Firefox's download manager (it falls back to the
  // blob URL's own UUID as the name, Mozilla Bugzilla #1282407), even with
  // the anchor connected to the DOM and a real MouseEvent dispatched (the
  // two earlier fixes). That's why the filename path creates no blob: URL
  // and no anchor at all: it goes entirely via POST to the server, which
  // returns a real Content-Disposition.
  it("creates no blob: URL and no anchor, goes straight to the server", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc, "relatorio.pdf");
    expect(document.body.querySelector("a")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("POSTs to /api/pdf-download with the blob in the body and the filename in a header", async () => {
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

  it("navigates (window.location.href) to the download URL returned by the server", async () => {
    const openPdfBlob = await freshOpenPdfBlob();
    await openPdfBlob(mockDoc, "relatorio.pdf");
    expect(window.location.href).toBe("/api/pdf-download/tok-123");
  });

  it("throws a clear error if the POST fails, without navigating", async () => {
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

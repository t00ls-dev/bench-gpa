// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openPdfBlob } from "./export-pdf";

function createMockDoc() {
  return {
    output: vi.fn(() => new Blob(["mock-pdf"])),
  } as any;
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
    openPdfBlob(mockDoc as any);
    expect(mockDoc.output).toHaveBeenCalledWith("blob");
  });

  it("creates an anchor element", () => {
    openPdfBlob(mockDoc as any);
    expect(document.createElement).toHaveBeenCalledWith("a");
  });

  it("sets anchor href to blob URL", () => {
    openPdfBlob(mockDoc as any);
    expect(anchorEl.href).toBe("blob:mock");
  });

  it("sets anchor target and rel", () => {
    openPdfBlob(mockDoc as any);
    expect(anchorEl.target).toBe("_blank");
    expect(anchorEl.rel).toBe("noopener noreferrer");
  });

  it("clicks the anchor", () => {
    openPdfBlob(mockDoc as any);
    expect(anchorEl.click).toHaveBeenCalledTimes(1);
  });

  it("revokes blob URL after 10s", () => {
    openPdfBlob(mockDoc as any);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});

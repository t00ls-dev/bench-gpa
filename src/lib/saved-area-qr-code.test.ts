// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSavedAreaQrCode, getSavedAreaAnalysisUrl } from "./saved-area-qr-code";

const fillRect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
});

describe("saved area QR Code", () => {
  it("builds the permanent analysis URL from the current origin", () => {
    expect(
      getSavedAreaAnalysisUrl("https://gpa.example.com", "550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("https://gpa.example.com/area/550e8400-e29b-41d4-a716-446655440000");
  });

  it("generates SVG and a real PNG data URL from the same matrix", async () => {
    const qrCode = await generateSavedAreaQrCode(
      "https://gpa.example.com/area/550e8400-e29b-41d4-a716-446655440000",
    );

    expect(qrCode.svgDataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(qrCode.svgDataUrl)).toContain("<svg");
    expect(decodeURIComponent(qrCode.svgDataUrl)).toContain("<path");
    expect(qrCode.pngDataUrl).toBe("data:image/png;base64,cG5n");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
    expect(fillRect).toHaveBeenCalled();
  });
});

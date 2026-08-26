// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SavedAreaQrCodeDialog } from "./saved-area-qr-code-dialog";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock("@/lib/saved-area-qr-code", () => ({
  generateSavedAreaQrCode: (...args: unknown[]) => mocks.generate(...args),
  getSavedAreaAnalysisUrl: (origin: string, id: string) => `${origin}/area/${id}`,
}));

describe("SavedAreaQrCodeDialog", () => {
  it("shows the permanent URL and exposes SVG and PNG downloads", async () => {
    mocks.generate.mockResolvedValue({
      svgDataUrl: "data:image/svg+xml;charset=utf-8,svg",
      pngDataUrl: "data:image/png;base64,png",
    });

    render(
      <SavedAreaQrCodeDialog
        analysis={{ id: "analysis-id", name: "Área Centro" }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const url = `${window.location.origin}/area/analysis-id`;
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledWith(url);
    expect(await screen.findByAltText("QR Code para Área Centro")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Baixar SVG" })).toHaveAttribute(
      "download",
      "area-centro-qr-code.svg",
    );
    expect(screen.getByRole("link", { name: "Baixar PNG" })).toHaveAttribute(
      "download",
      "area-centro-qr-code.png",
    );
  });
});

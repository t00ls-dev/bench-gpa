// @vitest-environment jsdom
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SavedAreaAnalysesManager } from "./saved-area-analyses-manager";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  qrDialog: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/saved-area-analyses.functions", () => ({
  listSavedAreaAnalyses: (...args: unknown[]) => mocks.list(...args),
  getSavedAreaAnalysis: (...args: unknown[]) => mocks.get(...args),
  deleteSavedAreaAnalysis: (...args: unknown[]) => mocks.remove(...args),
}));

vi.mock("@/components/saved-area-analysis-dialog", () => ({
  SavedAreaAnalysisDialog: () => null,
}));

vi.mock("@/components/saved-area-qr-code-dialog", () => ({
  SavedAreaQrCodeDialog: (props: { analysis: { id: string; name: string } }) => {
    mocks.qrDialog(props);
    return null;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

const summary = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  ownerUserId: "owner-1",
  name: "Área salva",
  storeCode: "1516",
  storeName: "Loja Teste",
  productCount: 2,
  createdAt: "2026-08-26T12:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([summary]);
  mocks.remove.mockResolvedValue({ ok: true });
  mocks.navigate.mockResolvedValue(undefined);
});

describe("SavedAreaAnalysesManager", () => {
  it("loads private analyses when the sheet opens", async () => {
    const { queryClient } = renderWithClient(
      <SavedAreaAnalysesManager
        currentUserId="owner-1"
        hierarchy={[]}
        stores={[]}
        currentProductCodes={[]}
      />,
    );

    expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Análises salvas" }));

    expect(await screen.findByText("Área salva")).toBeInTheDocument();
    expect(screen.getByText(/Loja 1516 - Loja Teste/)).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith({});
    expect(queryClient.getQueryData(["saved-area-analyses", "owner-1"])).toEqual([summary]);
    expect(queryClient.getQueryData(["saved-area-analyses"])).toBeUndefined();
  });

  it("hard-deletes an analysis after confirmation", async () => {
    renderWithClient(
      <SavedAreaAnalysesManager
        currentUserId="owner-1"
        hierarchy={[]}
        stores={[]}
        currentProductCodes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Análises salvas" }));
    await screen.findByText("Área salva");

    fireEvent.click(screen.getByRole("button", { name: "Excluir Área salva" }));
    expect(screen.getByText("Excluir análise salva?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith({ data: { id: summary.id } });
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Análise excluída.");
    });
  });

  it("opens the QR Code dialog for a saved analysis", async () => {
    renderWithClient(
      <SavedAreaAnalysesManager
        currentUserId="owner-1"
        hierarchy={[]}
        stores={[]}
        currentProductCodes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Análises salvas" }));
    await screen.findByText("Área salva");

    fireEvent.click(screen.getByRole("button", { name: "Gerar QR Code para Área salva" }));

    expect(mocks.qrDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({ id: summary.id, name: summary.name }),
        open: true,
      }),
    );
  });

  it("hides editing and QR actions while viewing a saved analysis", () => {
    renderWithClient(
      <SavedAreaAnalysesManager
        currentUserId="viewer-1"
        hierarchy={[]}
        stores={[]}
        currentProductCodes={["100"]}
        currentAnalysis={{
          ...summary,
          description: null,
          productCodes: ["100"],
          productHierarchy: [],
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Editar análise" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "QR Code" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Análises salvas" })).toBeEnabled();
  });
});

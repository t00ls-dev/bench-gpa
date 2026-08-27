// @vitest-environment jsdom
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SavedAreaAnalysisDialog } from "./saved-area-analysis-dialog";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  productOptions: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/saved-area-analyses.functions", () => ({
  createSavedAreaAnalysis: (...args: unknown[]) => mocks.create(...args),
  updateSavedAreaAnalysis: (...args: unknown[]) => mocks.update(...args),
}));

vi.mock("@/lib/area.functions", () => ({
  getAreaProductFilterOptions: (...args: unknown[]) => mocks.productOptions(...args),
}));

vi.mock("@/components/multi-select", () => ({
  MultiSelect: ({
    ariaLabel,
    options,
    value,
    onChange,
    disabled,
  }: {
    ariaLabel: string;
    options: { value: string; label: string }[];
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value[0] ?? ""}
      onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      disabled={disabled}
    >
      <option value="">Todos</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const stores = [{ code: "1516", name: "Loja Teste" }];
const hierarchy = [
  {
    store_code: "1516",
    store_name: "Loja Teste",
    depto: "PERECIVEIS",
    secao: "PADARIA",
    grupo: "PAES",
    subgrupo: "FRANCES",
  },
];
const analysis = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  ownerUserId: "owner-1",
  name: "Área original",
  storeCode: "1516",
  storeName: "Loja Teste",
  productCount: 1,
  productCodes: ["100"],
  createdAt: "2026-08-26T12:00:00.000Z",
  updatedAt: "2026-08-26T13:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ ok: true, id: analysis.id });
  mocks.update.mockResolvedValue({ ok: true });
  mocks.productOptions.mockResolvedValue([{ prodCode: "100", prodName: "Produto Teste" }]);
});

describe("SavedAreaAnalysisDialog", () => {
  it("creates an analysis from the current store and product composition", async () => {
    const onSaved = vi.fn();
    renderWithClient(
      <SavedAreaAnalysisDialog
        open
        stores={stores}
        hierarchy={hierarchy}
        initialStoreCode="1516"
        initialProductCodes={["100"]}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "  Nova área  " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await vi.waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        data: { name: "Nova área", storeCode: "1516", productCodes: ["100"] },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(analysis.id);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Análise salva.");
  });

  it("updates only the changed name and keeps the store disabled", async () => {
    renderWithClient(
      <SavedAreaAnalysisDialog
        open
        analysis={analysis}
        stores={stores}
        hierarchy={hierarchy}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Loja")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Área renomeada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        data: { id: analysis.id, name: "Área renomeada" },
      }),
    );
  });

  it("uses hierarchy filters only to refine the product options", async () => {
    renderWithClient(
      <SavedAreaAnalysisDialog
        open
        stores={stores}
        hierarchy={hierarchy}
        initialStoreCode="1516"
        initialProductCodes={["100"]}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "PERECIVEIS" },
    });

    await vi.waitFor(() =>
      expect(mocks.productOptions).toHaveBeenCalledWith({
        data: {
          stores: ["1516"],
          deptos: ["PERECIVEIS"],
          secoes: [],
          grupos: [],
          subgrupos: [],
        },
      }),
    );
    expect(screen.getByText("1 produto(s) selecionado(s)")).toBeInTheDocument();
  });
});

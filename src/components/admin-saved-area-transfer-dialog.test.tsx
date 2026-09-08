// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSavedAreaTransferDialog } from "./admin-saved-area-transfer-dialog";

const mocks = vi.hoisted(() => ({
  searchRecipients: vi.fn(),
  transfer: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/admin-users.functions", () => ({
  searchSavedAreaRecipients: mocks.searchRecipients,
}));

vi.mock("@/lib/saved-area-analyses.functions", () => ({
  transferSavedAreaAnalysis: mocks.transfer,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

function renderDialog(onTransferred = vi.fn(), onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AdminSavedAreaTransferDialog
        analysis={{
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Área salva",
          ownerUserId: "owner-1",
          ownerName: "Proprietário atual",
          ownerUsername: "owner",
        }}
        open
        onOpenChange={onOpenChange}
        onTransferred={onTransferred}
      />
    </QueryClientProvider>,
  );
  return { onTransferred, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transfer.mockResolvedValue({ ok: true });
  mocks.searchRecipients.mockResolvedValue([
    {
      id: "recipient-1",
      name: "Nova responsável",
      username: "recipient",
      employeeId: "001234",
    },
  ]);
});

describe("AdminSavedAreaTransferDialog", () => {
  it("searches on demand and submits only after selecting a recipient", async () => {
    const callbacks = renderDialog();

    expect(screen.getByText(/atualmente de Proprietário atual/i)).toBeInTheDocument();
    expect(mocks.searchRecipients).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Transferir" })).toBeDisabled();

    const searchInput = screen.getByRole("combobox", { name: "Buscar novo proprietário" });
    fireEvent.change(searchInput, { target: { value: "No" } });
    expect(screen.getByText("Digite ao menos 3 caracteres.")).toBeInTheDocument();
    expect(mocks.searchRecipients).not.toHaveBeenCalled();

    fireEvent.change(searchInput, { target: { value: "Nova" } });
    expect(mocks.searchRecipients).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("option", { name: /Nova responsável.*001234.*recipient/i }),
    ).toBeInTheDocument();
    expect(mocks.searchRecipients).toHaveBeenCalledOnce();
    expect(mocks.searchRecipients).toHaveBeenCalledWith({
      data: {
        analysisId: "550e8400-e29b-41d4-a716-446655440000",
        q: "Nova",
      },
    });
    expect(screen.getByRole("button", { name: "Transferir" })).toBeDisabled();

    fireEvent.click(screen.getByRole("option", { name: /Nova responsável.*001234.*recipient/i }));
    expect(screen.getByRole("button", { name: "Transferir" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Transferir" }));

    await vi.waitFor(() =>
      expect(mocks.transfer).toHaveBeenCalledWith({
        data: {
          analysisId: "550e8400-e29b-41d4-a716-446655440000",
          targetUserId: "recipient-1",
        },
      }),
    );
    await vi.waitFor(() => {
      expect(callbacks.onTransferred).toHaveBeenCalledOnce();
      expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Propriedade transferida.");
    });
  });

  it("shows an empty result without exposing the complete user list", async () => {
    mocks.searchRecipients.mockResolvedValue([]);
    renderDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "Buscar novo proprietário" }), {
      target: { value: "999" },
    });

    expect(await screen.findByText("Nenhum usuário elegível encontrado.")).toBeInTheDocument();
    expect(mocks.searchRecipients).toHaveBeenCalledWith({
      data: {
        analysisId: "550e8400-e29b-41d4-a716-446655440000",
        q: "999",
      },
    });
  });

  it("hides stale results while waiting for the next debounced search", async () => {
    mocks.searchRecipients.mockImplementation(({ data }: { data: { q: string } }) =>
      Promise.resolve(
        data.q === "Nova"
          ? [
              {
                id: "recipient-1",
                name: "Nova responsável",
                username: "recipient",
                employeeId: "001234",
              },
            ]
          : [],
      ),
    );
    renderDialog();
    const searchInput = screen.getByRole("combobox", { name: "Buscar novo proprietário" });

    fireEvent.change(searchInput, { target: { value: "Nova" } });
    expect(
      await screen.findByRole("option", { name: /Nova responsável.*001234.*recipient/i }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Outro" } });
    expect(screen.queryByText("Nova responsável")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Buscando");
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(screen.queryByText("Nova responsável")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transferir" })).toBeDisabled();
    expect(await screen.findByText("Nenhum usuário elegível encontrado.")).toBeInTheDocument();
  });

  it("selects a recipient with keyboard navigation", async () => {
    renderDialog();
    const searchInput = screen.getByRole("combobox", { name: "Buscar novo proprietário" });

    fireEvent.change(searchInput, { target: { value: "Nova" } });
    const option = await screen.findByRole("option", {
      name: /Nova responsável.*001234.*recipient/i,
    });
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    expect(option).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(screen.getByText("Nova responsável")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transferir" })).toBeEnabled();
  });
});

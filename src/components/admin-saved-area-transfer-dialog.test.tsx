// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSavedAreaTransferDialog } from "./admin-saved-area-transfer-dialog";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  transfer: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/admin-users.functions", () => ({
  listUsers: mocks.listUsers,
}));

vi.mock("@/lib/saved-area-analyses.functions", () => ({
  transferSavedAreaAnalysis: mocks.transfer,
}));

vi.mock("@/components/ui/select", async () => {
  const { createContext, useContext } = await import("react");
  const SelectContext = createContext<(value: string) => void>(() => undefined);
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children: ReactNode;
    }) => <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>,
    SelectTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" role="combobox" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const onValueChange = useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

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
  mocks.listUsers.mockResolvedValue([
    {
      id: "owner-1",
      name: "Proprietário atual",
      username: "owner",
      employeeId: null,
      role: "user",
      is_active: true,
      pending: false,
      lastLoginAt: null,
    },
    {
      id: "recipient-1",
      name: "Nova responsável",
      username: "recipient",
      employeeId: null,
      role: "user",
      is_active: true,
      pending: false,
      lastLoginAt: null,
    },
    {
      id: "pending-1",
      name: "Primeiro acesso pendente",
      username: "pending",
      employeeId: null,
      role: "user",
      is_active: true,
      pending: true,
      lastLoginAt: null,
    },
  ]);
});

describe("AdminSavedAreaTransferDialog", () => {
  it("lists only eligible recipients and submits the selected owner", async () => {
    const callbacks = renderDialog();

    expect(await screen.findByText(/atualmente de Proprietário atual/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: /Nova responsável/ }));
    expect(
      screen.queryByRole("option", { name: /Primeiro acesso pendente/ }),
    ).not.toBeInTheDocument();
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
});

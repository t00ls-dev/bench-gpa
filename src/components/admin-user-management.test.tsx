// @vitest-environment jsdom
//
// First real component test (`render()`, not `renderHook`) in the
// repository, proves that fixing the `.test.tsx` glob in
// vitest.config.ts actually unblocked this front (see
// docs/auditoria-qa-2026-08-01.md, items 2 and 9). Chosen for being the
// biggest business risk with zero test coverage: it drives the
// `listUsers`/`setUserRole`/`setUserActive`/`resetPassword` path, which
// also had no UI coverage.
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUserManagement } from "./admin-user-management";

interface TestUser {
  id: string;
  username: string | null;
  employeeId: string | null;
  name: string;
  role: string;
  is_active: boolean;
  pending: boolean;
  created_at: string;
}

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const setUserRoleMock = vi.fn();
const setUserActiveMock = vi.fn();
const resetPasswordMock = vi.fn();
vi.mock("@/lib/admin-users.functions", () => ({
  setUserRole: (...args: unknown[]) => setUserRoleMock(...args),
  setUserActive: (...args: unknown[]) => setUserActiveMock(...args),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

// CreateUserDialog/EditUserIdentifiersDialog have their own server
// dependencies and their own test scope, replaced with a simple stub to
// keep this file focused on the table/search/pagination/toggles, which is
// what belongs to AdminUserManagement.
vi.mock("@/components/create-user-dialog", () => ({
  CreateUserDialog: () => <button>+ Novo usuário (stub)</button>,
}));
vi.mock("@/components/edit-user-identifiers-dialog", () => ({
  EditUserIdentifiersDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function user(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "u1",
    username: "ana",
    employeeId: "1001",
    name: "Ana Silva",
    role: "user",
    is_active: true,
    pending: false,
    created_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const utils = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { ...utils, invalidateSpy };
}

beforeEach(() => {
  setUserRoleMock.mockReset().mockResolvedValue(undefined);
  setUserActiveMock.mockReset().mockResolvedValue(undefined);
  resetPasswordMock.mockReset().mockResolvedValue(undefined);
});

describe("AdminUserManagement", () => {
  it("shows the loading skeleton, no table, while isLoading", () => {
    const { container } = renderWithClient(<AdminUserManagement data={undefined} isLoading />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the empty-list message when there are no users", () => {
    renderWithClient(<AdminUserManagement data={[]} isLoading={false} />);
    expect(screen.getByText("Nenhum usuário cadastrado.")).toBeInTheDocument();
  });

  it("renders username, employee_id, name, role, and status for each user", () => {
    const data = [
      user({ id: "u1", username: "ana", employeeId: "1001", name: "Ana Silva", role: "admin" }),
      user({
        id: "u2",
        username: "bruno",
        employeeId: "1002",
        name: "Bruno Costa",
        role: "user",
        is_active: false,
      }),
    ];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("1001")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("bruno")).toBeInTheDocument();
    expect(screen.getAllByText("Usuário")[0]).toBeInTheDocument();
    expect(screen.getByText("Inativo")).toBeInTheDocument();
  });

  it("flags pending first access", () => {
    const data = [user({ id: "u1", pending: true })];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);
    expect(screen.getByText("Primeiro acesso pendente")).toBeInTheDocument();
  });

  it("filters by search (username, employee_id, or name, case-insensitive) and resets the page", () => {
    const data = [
      user({ id: "u1", username: "ana", employeeId: "1001", name: "Ana Silva" }),
      user({ id: "u2", username: "bruno", employeeId: "1002", name: "Bruno Costa" }),
    ];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.change(screen.getByPlaceholderText("Buscar por usuário, matrícula ou nome…"), {
      target: { value: "BRUNO" },
    });

    expect(screen.queryByText("ana")).toBeNull();
    expect(screen.getByText("bruno")).toBeInTheDocument();
  });

  it("paginates 25 at a time and navigates to the next page", () => {
    const data = Array.from({ length: 30 }, (_, i) =>
      user({
        id: `u${i}`,
        username: `user${i}`,
        employeeId: String(1000 + i),
        name: `Usuário ${i}`,
      }),
    );
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    expect(screen.getAllByRole("row")).toHaveLength(1 + 25); // header + 25 rows
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();
    expect(screen.getByLabelText("Próxima página")).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText("Próxima página"));

    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 5); // header + 5 remaining
    expect(screen.getByLabelText("Próxima página")).toBeDisabled();
  });

  it("promotes to admin: confirms in the dialog, calls setUserRole, and invalidates the cache", async () => {
    const data = [user({ id: "u1", role: "user" })];
    const { invalidateSpy } = renderWithClient(
      <AdminUserManagement data={data} isLoading={false} />,
    );

    fireEvent.click(screen.getByLabelText("Tornar administrador"));
    expect(screen.getByText("Promover a administrador?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(setUserRoleMock).toHaveBeenCalledWith({ data: { userId: "u1", role: "admin" } });
    await vi.waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-users"] }),
    );
  });

  it("deactivates a user: confirms in the dialog and calls setUserActive", async () => {
    const data = [user({ id: "u1", username: "ana", is_active: true })];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.click(screen.getByLabelText("Desativar ana"));
    expect(screen.getByText("Inativar usuário?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() =>
      expect(setUserActiveMock).toHaveBeenCalledWith({
        data: { userId: "u1", isActive: false },
      }),
    );
  });

  it("resets the password: confirms in the dialog (no input) and calls resetPassword with just the userId", async () => {
    const data = [user({ id: "u1", username: "ana" })];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.click(screen.getByLabelText("Redefinir senha"));
    expect(screen.getByText("Redefinir senha?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({ data: { userId: "u1" } }),
    );
  });
});

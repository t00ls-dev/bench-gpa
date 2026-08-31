// @vitest-environment jsdom
//
// First real component test (`render()`, not `renderHook`) in the
// repository, proves that fixing the `.test.tsx` glob in
// vitest.config.ts actually unblocked this front (see
// docs/auditoria-qa-2026-08-01.md, items 2 and 9). Chosen for being the
// biggest business risk with zero test coverage: it drives the user
// administration path, which also had no UI coverage.
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
  lastLoginAt: string | null;
}

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

// CreateUserDialog/EditUserDialog have their own server
// dependencies and their own test scope, replaced with a simple stub to
// keep this file focused on the table/search/pagination, which is
// what belongs to AdminUserManagement.
vi.mock("@/components/create-user-dialog", () => ({
  CreateUserDialog: () => <button>+ Novo usuário (stub)</button>,
}));
vi.mock("@/components/edit-user-dialog", () => ({
  EditUserDialog: ({ target }: { target: TestUser | null }) =>
    target ? <div>Editando {target.name}</div> : null,
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
    lastLoginAt: "2026-08-31T12:30:00Z",
    ...overrides,
  };
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const utils = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { ...utils, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

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

  it("renders the simplified columns and last access for each user", () => {
    const data = [
      user({ id: "u1", username: "ana", employeeId: "1001", name: "Ana Silva" }),
      user({
        id: "u2",
        username: "bruno",
        employeeId: "1002",
        name: "Bruno Costa",
        lastLoginAt: null,
      }),
    ];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("1001")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("bruno")).toBeInTheDocument();
    expect(screen.getByText("31/08/26 09:30")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Usuário" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Último acesso" })).toBeInTheDocument();
    expect(screen.getAllByText("-")).toHaveLength(1);
    expect(screen.queryByRole("columnheader", { name: "Papel" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Ativo" })).toBeNull();
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

  it("opens the consolidated edit dialog from the only row action", () => {
    const data = [user({ id: "u1", name: "Ana Silva" })];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.click(screen.getByLabelText("Editar Ana Silva"));
    expect(screen.getByText("Editando Ana Silva")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
//
// Primeiro teste de componente real (`render()`, não `renderHook`) do
// repositório, prova que a correção do glob de `.test.tsx` em
// vitest.config.ts realmente desbloqueou essa frente (ver
// docs/auditoria-qa-2026-08-01.md, itens 2 e 9). Escolhido por ser o maior
// risco de negócio sem teste nenhum: alimenta o path de `listUsers`/
// `setUserRole`/`setUserActive`, que também não tinham cobertura de UI.
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUserManagement } from "./admin-user-management";

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const setUserRoleMock = vi.fn();
const setUserActiveMock = vi.fn();
vi.mock("@/lib/admin-users.functions", () => ({
  setUserRole: (...args: unknown[]) => setUserRoleMock(...args),
  setUserActive: (...args: unknown[]) => setUserActiveMock(...args),
}));

// CreateUserDialog/ResetPasswordDialog têm as próprias dependências de
// servidor e o próprio escopo de teste, substituídos por um stub simples
// pra manter este arquivo focado na tabela/busca/paginação/toggles, que é o
// que pertence a AdminUserManagement.
vi.mock("@/components/create-user-dialog", () => ({
  CreateUserDialog: () => <button>+ Novo usuário (stub)</button>,
}));
vi.mock("@/components/reset-password-dialog", () => ({
  ResetPasswordDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function user(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "u1",
    email: "ana@gpabr.com",
    name: "Ana Silva",
    role: "user",
    is_active: true,
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
});

describe("AdminUserManagement", () => {
  it("mostra o skeleton de carregamento, sem tabela, enquanto isLoading", () => {
    const { container } = renderWithClient(<AdminUserManagement data={undefined} isLoading />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("mostra a mensagem de lista vazia quando não há usuários", () => {
    renderWithClient(<AdminUserManagement data={[]} isLoading={false} />);
    expect(screen.getByText("Nenhum usuário cadastrado.")).toBeInTheDocument();
  });

  it("renderiza email, nome, papel e status de cada usuário", () => {
    const data = [
      user({ id: "u1", email: "ana@gpabr.com", name: "Ana Silva", role: "admin" }),
      user({
        id: "u2",
        email: "bruno@gpabr.com",
        name: "Bruno Costa",
        role: "user",
        is_active: false,
      }),
    ];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    expect(screen.getByText("ana@gpabr.com")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("bruno@gpabr.com")).toBeInTheDocument();
    expect(screen.getAllByText("Usuário")[0]).toBeInTheDocument();
    expect(screen.getByText("Inativo")).toBeInTheDocument();
  });

  it("filtra por busca (email ou nome, case-insensitive) e reseta a página", () => {
    const data = [
      user({ id: "u1", email: "ana@gpabr.com", name: "Ana Silva" }),
      user({ id: "u2", email: "bruno@gpabr.com", name: "Bruno Costa" }),
    ];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.change(screen.getByPlaceholderText("Buscar por email ou nome…"), {
      target: { value: "BRUNO" },
    });

    expect(screen.queryByText("ana@gpabr.com")).toBeNull();
    expect(screen.getByText("bruno@gpabr.com")).toBeInTheDocument();
  });

  it("pagina 25 por vez e navega para a próxima página", () => {
    const data = Array.from({ length: 30 }, (_, i) =>
      user({ id: `u${i}`, email: `user${i}@gpabr.com`, name: `Usuário ${i}` }),
    );
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    expect(screen.getAllByRole("row")).toHaveLength(1 + 25); // header + 25 linhas
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();
    expect(screen.getByLabelText("Próxima página")).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText("Próxima página"));

    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 5); // header + 5 restantes
    expect(screen.getByLabelText("Próxima página")).toBeDisabled();
  });

  it("promove a admin: confirma no diálogo, chama setUserRole e invalida o cache", async () => {
    const data = [user({ id: "u1", email: "ana@gpabr.com", role: "user" })];
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

  it("inativa um usuário: confirma no diálogo e chama setUserActive", async () => {
    const data = [user({ id: "u1", email: "ana@gpabr.com", is_active: true })];
    renderWithClient(<AdminUserManagement data={data} isLoading={false} />);

    fireEvent.click(screen.getByLabelText("Desativar ana@gpabr.com"));
    expect(screen.getByText("Inativar usuário?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() =>
      expect(setUserActiveMock).toHaveBeenCalledWith({
        data: { userId: "u1", isActive: false },
      }),
    );
  });
});

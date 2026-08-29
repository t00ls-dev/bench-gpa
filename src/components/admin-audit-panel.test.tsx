// @vitest-environment jsdom
//
// buildAuditTooltip is tested separately, in src/lib/audit-tooltip.test.ts.
// AuditLogSection is only tested up to whether a clickable button exists
// per row, without opening Radix's Popover (Portal + ResizeObserver don't
// exist in this project's jsdom, see vitest.setup.ts).
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogSection } from "./admin-audit-panel";
import type { AuditRow } from "@/lib/admin-system.functions";

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 1,
    created_at: "2026-08-03 10:00:00",
    actor_username: "admin",
    action: "auth.login",
    target_type: null,
    target_id: null,
    target_username: null,
    detail: null,
    ip: "203.0.113.5",
    ...overrides,
  };
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AuditLogSection", () => {
  it("shows the empty-list message when there are no events", async () => {
    const auditFn = () => Promise.resolve({ events: [], total: 0, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    expect(await screen.findByText("Nenhum evento registrado.")).toBeInTheDocument();
  });

  it("renders a known label and falls back to the raw action name for an unknown one", async () => {
    const events = [
      row({ id: 1, action: "user.create" }),
      row({ id: 2, action: "algo.inexistente" }),
    ];
    const auditFn = () => Promise.resolve({ events, total: 2, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);

    expect(await screen.findByText("Criou usuário")).toBeInTheDocument();
    expect(screen.getByText("algo.inexistente")).toBeInTheDocument();
  });

  it("renders labels for first-access, self password change, and identifiers update", async () => {
    const events = [
      row({ id: 1, action: "auth.first_access_failed" }),
      row({ id: 2, action: "auth.first_access_completed" }),
      row({ id: 3, action: "auth.password_change" }),
      row({ id: 4, action: "user.identifiers_update" }),
    ];
    const auditFn = () => Promise.resolve({ events, total: 4, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);

    expect(await screen.findByText("Primeiro acesso falhou")).toBeInTheDocument();
    expect(screen.getByText("Primeiro acesso concluído")).toBeInTheDocument();
    expect(screen.getByText("Trocou a própria senha")).toBeInTheDocument();
    expect(screen.getByText("Atualizou identificadores")).toBeInTheDocument();
  });

  it("only makes the action clickable (with a tooltip) when there's a username or detail to show", async () => {
    const events = [
      row({ id: 1, action: "auth.login", target_username: null, detail: null }),
      row({
        id: 2,
        action: "user.role_change",
        target_username: "ana",
        detail: "novo papel: admin",
      }),
    ];
    const auditFn = () => Promise.resolve({ events, total: 2, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);

    const loginRow = (await screen.findByText("Login")).closest("tr");
    expect(loginRow).not.toBeNull();
    expect(within(loginRow as HTMLElement).queryByRole("button")).toBeNull();

    const roleChangeRow = screen.getByText("Alterou papel").closest("tr");
    expect(roleChangeRow).not.toBeNull();
    expect(within(roleChangeRow as HTMLElement).getByRole("button")).toBeInTheDocument();
  });

  it("shows Data, Ação, Usuário, and IP in that order", async () => {
    const auditFn = () => Promise.resolve({ events: [row()], total: 1, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    await screen.findByRole("table");

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Data", "Ação", "Usuário", "IP"]);
  });

  it("requests the default page and changes to the next one", async () => {
    const auditFn = vi.fn().mockResolvedValue({
      events: [row()],
      total: 80,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);

    await waitFor(() =>
      expect(auditFn).toHaveBeenCalledWith({
        search: "",
        sortBy: "created_at",
        sortDir: "desc",
        limit: 25,
        offset: 0,
      }),
    );
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(auditFn).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })),
    );
    expect(screen.getByText("Página 2 de 4")).toBeInTheDocument();
  });

  it("sorts columns on the server and resets to the first page", async () => {
    const auditFn = vi.fn().mockResolvedValue({
      events: [row()],
      total: 80,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(auditFn).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ação" }));

    await waitFor(() =>
      expect(auditFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "action", sortDir: "asc", offset: 0 }),
      ),
    );
    expect(screen.getByRole("columnheader", { name: "Ação" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("changes the server page size through the shared selector", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const auditFn = vi.fn().mockResolvedValue({
      events: [row()],
      total: 300,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    await screen.findByRole("table");

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "100 / página" }));

    await waitFor(() =>
      expect(auditFn).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100, offset: 0 })),
    );
  });

  it("debounces server search and keeps the controls available when no event matches", async () => {
    const auditFn = vi.fn().mockImplementation((query: { search: string }) =>
      Promise.resolve({
        events: query.search ? [] : [row()],
        total: query.search ? 0 : 1,
        limit: 25,
        offset: 0,
      }),
    );
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar na trilha de auditoria" }), {
      target: { value: "admin" },
    });

    expect(auditFn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Nenhum evento encontrado.")).toBeInTheDocument();
    expect(auditFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "admin", offset: 0 }),
    );
    expect(screen.getByRole("button", { name: "Limpar busca" })).toBeInTheDocument();
  });
});

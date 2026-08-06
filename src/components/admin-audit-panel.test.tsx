// @vitest-environment jsdom
//
// buildAuditTooltip is tested separately, in src/lib/audit-tooltip.test.ts.
// AuditLogSection is only tested up to whether a clickable button exists
// per row, without opening Radix's Popover (Portal + ResizeObserver don't
// exist in this project's jsdom, see vitest.setup.ts).
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
});

// @vitest-environment jsdom
//
// buildAuditTooltip é testado direto (sem montar o Popover do Radix: Portal +
// ResizeObserver não existem no jsdom deste projeto, ver vitest.setup.ts).
// AuditLogSection é testado só até o ponto de existir ou não um botão
// clicável por linha, sem abrir o popover, pelo mesmo motivo.
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogSection, buildAuditTooltip } from "./admin-audit-panel";
import type { AuditRow } from "@/lib/admin-system.functions";

describe("buildAuditTooltip", () => {
  it("retorna vazio quando não há e-mail nem detalhe", () => {
    expect(buildAuditTooltip("auth.login", null, null)).toBe("");
  });

  it("retorna só o e-mail quando não há detalhe", () => {
    expect(buildAuditTooltip("user.role_change", "ana@gpabr.com", null)).toBe("ana@gpabr.com");
  });

  it("retorna só o detalhe quando não há e-mail (ex.: purga de dados)", () => {
    expect(buildAuditTooltip("data.purge", null, "purge manual, 120 registros")).toBe(
      "purge manual, 120 registros",
    );
  });

  it("combina e-mail e detalhe com parênteses, nunca travessão", () => {
    const result = buildAuditTooltip("user.role_change", "ana@gpabr.com", "novo papel: admin");
    expect(result).toBe("ana@gpabr.com (novo papel: admin)");
    expect(result).not.toContain("—");
  });

  it("ignora o detail de user.activate/user.deactivate mesmo quando gravado (texto antigo)", () => {
    // Linhas gravadas antes do JOIN por target_id existir têm detail solto
    // tipo "reativou a conta"/"inativou a conta", que não deve mais aparecer.
    expect(buildAuditTooltip("user.deactivate", "ana@gpabr.com", "inativou a conta")).toBe(
      "ana@gpabr.com",
    );
    expect(buildAuditTooltip("user.activate", "ana@gpabr.com", "reativou a conta")).toBe(
      "ana@gpabr.com",
    );
  });

  it("user.activate/user.deactivate sem target_email (usuário excluído) cai pra vazio", () => {
    expect(buildAuditTooltip("user.deactivate", null, "inativou a conta")).toBe("");
  });
});

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 1,
    created_at: "2026-08-03 10:00:00",
    actor_email: "admin@gpabr.com",
    action: "auth.login",
    target_type: null,
    target_id: null,
    target_email: null,
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
  it("mostra a mensagem de lista vazia quando não há eventos", async () => {
    const auditFn = () => Promise.resolve({ events: [], total: 0, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    expect(await screen.findByText("Nenhum evento registrado.")).toBeInTheDocument();
  });

  it("renderiza rótulo conhecido e cai no nome cru da ação pra uma desconhecida", async () => {
    const events = [
      row({ id: 1, action: "user.create" }),
      row({ id: 2, action: "algo.inexistente" }),
    ];
    const auditFn = () => Promise.resolve({ events, total: 2, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);

    expect(await screen.findByText("Criou usuário")).toBeInTheDocument();
    expect(screen.getByText("algo.inexistente")).toBeInTheDocument();
  });

  it("só torna a ação clicável (com tooltip) quando há e-mail ou detalhe pra mostrar", async () => {
    const events = [
      row({ id: 1, action: "auth.login", target_email: null, detail: null }),
      row({
        id: 2,
        action: "user.role_change",
        target_email: "ana@gpabr.com",
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

  it("mostra Data, Ação, Usuário e IP nessa ordem", async () => {
    const auditFn = () => Promise.resolve({ events: [row()], total: 1, limit: 50, offset: 0 });
    renderWithClient(<AuditLogSection auditFn={auditFn} />);
    await screen.findByRole("table");

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Data", "Ação", "Usuário", "IP"]);
  });
});

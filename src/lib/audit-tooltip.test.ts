import { describe, expect, it } from "vitest";
import { buildAuditTooltip } from "./audit-tooltip";

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

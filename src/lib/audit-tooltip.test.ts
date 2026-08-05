import { describe, expect, it } from "vitest";
import { buildAuditTooltip } from "./audit-tooltip";

describe("buildAuditTooltip", () => {
  it("retorna vazio quando não há username nem detalhe", () => {
    expect(buildAuditTooltip("auth.login", null, null)).toBe("");
  });

  it("retorna só o username quando não há detalhe", () => {
    expect(buildAuditTooltip("user.role_change", "ana", null)).toBe("ana");
  });

  it("retorna só o detalhe quando não há username (ex.: purga de dados)", () => {
    expect(buildAuditTooltip("data.purge", null, "purge manual, 120 registros")).toBe(
      "purge manual, 120 registros",
    );
  });

  it("combina username e detalhe com parênteses, nunca travessão", () => {
    const result = buildAuditTooltip("user.role_change", "ana", "novo papel: admin");
    expect(result).toBe("ana (novo papel: admin)");
    expect(result).not.toContain("—");
  });

  it("ignora o detail de user.activate/user.deactivate mesmo quando gravado (texto antigo)", () => {
    // Linhas gravadas antes do JOIN por target_id existir têm detail solto
    // tipo "reativou a conta"/"inativou a conta", que não deve mais aparecer.
    expect(buildAuditTooltip("user.deactivate", "ana", "inativou a conta")).toBe("ana");
    expect(buildAuditTooltip("user.activate", "ana", "reativou a conta")).toBe("ana");
  });

  it("user.activate/user.deactivate sem target_username (usuário excluído) cai pra vazio", () => {
    expect(buildAuditTooltip("user.deactivate", null, "inativou a conta")).toBe("");
  });
});

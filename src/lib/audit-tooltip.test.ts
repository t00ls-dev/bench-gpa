import { describe, expect, it } from "vitest";
import { buildAuditTooltip } from "./audit-tooltip";

describe("buildAuditTooltip", () => {
  it("returns empty when there's no username or detail", () => {
    expect(buildAuditTooltip("auth.login", null, null)).toBe("");
  });

  it("returns only the username when there's no detail", () => {
    expect(buildAuditTooltip("user.role_change", "ana", null)).toBe("ana");
  });

  it("returns only the detail when there's no username (e.g. data purge)", () => {
    expect(buildAuditTooltip("data.purge", null, "purge manual, 120 registros")).toBe(
      "purge manual, 120 registros",
    );
  });

  it("combines username and detail with parentheses, never an em dash", () => {
    const result = buildAuditTooltip("user.role_change", "ana", "novo papel: admin");
    expect(result).toBe("ana (novo papel: admin)");
    expect(result).not.toContain("—");
  });

  it("ignores the detail of user.activate/user.deactivate even when recorded (legacy text)", () => {
    // Rows recorded before the target_id JOIN existed have a free-standing
    // detail like "reativou a conta"/"inativou a conta", which shouldn't show up anymore.
    expect(buildAuditTooltip("user.deactivate", "ana", "inativou a conta")).toBe("ana");
    expect(buildAuditTooltip("user.activate", "ana", "reativou a conta")).toBe("ana");
  });

  it("user.activate/user.deactivate without target_username (deleted user) falls to empty", () => {
    expect(buildAuditTooltip("user.deactivate", null, "inativou a conta")).toBe("");
  });
});

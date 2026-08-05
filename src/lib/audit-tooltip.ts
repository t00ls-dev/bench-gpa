// Rows recorded before the target_id JOIN existed have a free-text `detail`
// ("reativou a conta"/"inativou a conta") that doesn't match the badge label
// (says "usuário") and adds nothing to target_username. Always ignored for
// these two actions, regardless of what's stored.
const ACTIONS_WITHOUT_EXTRA_DETAIL = new Set(["user.activate", "user.deactivate"]);

/**
 * Builds the audit trail action badge's tooltip text.
 */
export function buildAuditTooltip(
  action: string,
  targetUsername: string | null,
  detail: string | null,
): string {
  // target_username comes from a JOIN on `users` by target_id (not from the
  // `detail` recorded at the time): resolves the target by the CURRENT
  // username, even if it changed since the event (updateUserIdentifiers
  // allows editing), and even for events recorded before this JOIN existed,
  // without having to rewrite history.
  const effectiveDetail = ACTIONS_WITHOUT_EXTRA_DETAIL.has(action) ? null : detail;
  if (targetUsername && effectiveDetail) return `${targetUsername} (${effectiveDetail})`;
  return targetUsername ?? effectiveDetail ?? "";
}

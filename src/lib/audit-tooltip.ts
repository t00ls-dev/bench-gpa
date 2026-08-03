// Linhas gravadas antes do JOIN por target_id existir têm um `detail` de texto
// livre ("reativou a conta"/"inativou a conta") que não bate com o rótulo do
// badge (fala em "usuário") e não soma nada ao target_email. Ignorado sempre
// pra estas duas ações, independente do que estiver gravado.
const ACTIONS_WITHOUT_EXTRA_DETAIL = new Set(["user.activate", "user.deactivate"]);

/**
 * Monta o texto do tooltip do badge de ação da trilha de auditoria.
 */
export function buildAuditTooltip(
  action: string,
  targetEmail: string | null,
  detail: string | null,
): string {
  // target_email vem de um JOIN em `users` pelo target_id (não do `detail`
  // gravado na hora): resolve o alvo mesmo em eventos gravados antes desse
  // JOIN existir, sem precisar reescrever histórico.
  const effectiveDetail = ACTIONS_WITHOUT_EXTRA_DETAIL.has(action) ? null : detail;
  if (targetEmail && effectiveDetail) return `${targetEmail} (${effectiveDetail})`;
  return targetEmail ?? effectiveDetail ?? "";
}

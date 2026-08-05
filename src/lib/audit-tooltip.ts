// Linhas gravadas antes do JOIN por target_id existir têm um `detail` de texto
// livre ("reativou a conta"/"inativou a conta") que não bate com o rótulo do
// badge (fala em "usuário") e não soma nada ao target_username. Ignorado
// sempre pra estas duas ações, independente do que estiver gravado.
const ACTIONS_WITHOUT_EXTRA_DETAIL = new Set(["user.activate", "user.deactivate"]);

/**
 * Monta o texto do tooltip do badge de ação da trilha de auditoria.
 */
export function buildAuditTooltip(
  action: string,
  targetUsername: string | null,
  detail: string | null,
): string {
  // target_username vem de um JOIN em `users` pelo target_id (não do `detail`
  // gravado na hora): resolve o alvo pelo username ATUAL, mesmo que tenha
  // mudado desde o evento (updateUserIdentifiers permite editar), e mesmo em
  // eventos gravados antes desse JOIN existir, sem precisar reescrever
  // histórico.
  const effectiveDetail = ACTIONS_WITHOUT_EXTRA_DETAIL.has(action) ? null : detail;
  if (targetUsername && effectiveDetail) return `${targetUsername} (${effectiveDetail})`;
  return targetUsername ?? effectiveDetail ?? "";
}

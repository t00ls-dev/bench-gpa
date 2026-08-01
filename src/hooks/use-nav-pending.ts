"use client";

import { useRouterState } from "@tanstack/react-router";

/**
 * Caminho de destino de uma navegação em andamento, ou null quando ocioso.
 * Durante o pending, `location` já aponta (otimista) para o destino, enquanto
 * `resolvedLocation` ainda é a página renderizada.
 */
export function useNavPendingPath(): string | null {
  return useRouterState({
    select: (s) => (s.status === "pending" ? s.location.pathname : null),
  });
}

/**
 * True se a navegação pendente é para `to` (ou uma subrota dele, a menos que
 * `exact` seja true). Sem `exact`, "/admin" seria prefixo de "/admin/docs":
 * navegar para Documentação marcava Administração como pendente também.
 */
export function isNavPendingTo(pending: string | null, to: string, exact = false): boolean {
  if (pending == null) return false;
  if (to === "/") return pending === "/";
  if (exact) return pending === to || pending === to + "/";
  return pending === to || pending.startsWith(to + "/");
}

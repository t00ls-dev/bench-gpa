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

/** True se a navegação pendente é para `to` (ou uma subrota dele). */
export function isNavPendingTo(pending: string | null, to: string): boolean {
  if (pending == null) return false;
  if (to === "/") return pending === "/";
  return pending === to || pending.startsWith(to + "/");
}

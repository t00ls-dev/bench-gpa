"use client";

import { useRouterState } from "@tanstack/react-router";

/**
 * Caminho de destino de uma navegação em andamento, ou null quando ocioso.
 * Durante o pending, `location` já aponta (otimista) para o destino, enquanto
 * `resolvedLocation` ainda é a página renderizada.
 *
 * `resolvedLocation` também fica ausente durante a resolução inicial da rota
 * no SSR (nada foi resolvido ainda): sem essa checagem, o servidor sempre
 * desenha o item ativo com spinner (status "pending" = a própria carga
 * inicial), e o cliente já termina de hidratar com o status resolvido,
 * gerando mismatch de hidratação (ícone spinner vs ícone real) em toda
 * página, sempre no item ativo do menu.
 */
export function useNavPendingPath(): string | null {
  return useRouterState({
    select: (s) =>
      s.status === "pending" &&
      s.resolvedLocation &&
      s.resolvedLocation.pathname !== s.location.pathname
        ? s.location.pathname
        : null,
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

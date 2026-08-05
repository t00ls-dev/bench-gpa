"use client";

import { useRouterState } from "@tanstack/react-router";

/**
 * Destination path of an in-progress navigation, or null when idle. While
 * pending, `location` already points (optimistically) to the destination,
 * while `resolvedLocation` is still the rendered page.
 *
 * `resolvedLocation` is also absent during the route's initial SSR
 * resolution (nothing has resolved yet): without this check, the server
 * would always draw the active item with a spinner (status "pending" = the
 * initial load itself), and the client would already finish hydrating with
 * the resolved status, causing a hydration mismatch (spinner icon vs. real
 * icon) on every page, always on the active menu item.
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
 * True if the pending navigation is to `to` (or a subroute of it, unless
 * `exact` is true). Without `exact`, "/admin" would be a prefix of
 * "/admin/docs": navigating to Documentação would also mark Administração
 * as pending.
 */
export function isNavPendingTo(pending: string | null, to: string, exact = false): boolean {
  if (pending == null) return false;
  if (to === "/") return pending === "/";
  if (exact) return pending === to || pending === to + "/";
  return pending === to || pending.startsWith(to + "/");
}

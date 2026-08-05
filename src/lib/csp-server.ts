import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Real implementation of the per-request nonce, isolated in a file that
 * only the server entry (src/server.ts) imports. `node:async_hooks` doesn't
 * exist in the browser: a static import of it here, if this file were
 * imported by code shared with the client (like router.tsx, via
 * getCspNonce), would break module evaluation as soon as the client bundle
 * loads -- a real regression, found in production on 08/04/2026, a few
 * hours after this change shipped (see the history in src/lib/csp.ts).
 * That's why reading the nonce (getCspNonce, called by router.tsx on both
 * sides) lives in a separate file, with no Node import at all, which only
 * ever sees this through globalThis -- it never needs to import this
 * module.
 *
 * AsyncLocalStorage isolates by async execution chain, not by module: each
 * call to runWithCspNonce has its own value, even interleaved with others
 * in the same process (concurrent requests don't leak a nonce into each
 * other).
 */
const nonceStorage = new AsyncLocalStorage<string>();

declare global {
  var __cspNonceStorage: { getStore(): string | undefined } | undefined;
}

globalThis.__cspNonceStorage = nonceStorage;

export function runWithCspNonce<T>(nonce: string, fn: () => T): T {
  return nonceStorage.run(nonce, fn);
}

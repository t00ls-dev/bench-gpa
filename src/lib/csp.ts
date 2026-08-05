/**
 * Deliberately NO Node import here at all: this file is imported by
 * router.tsx, which runs both on the server and in the client bundle. The
 * real implementation (AsyncLocalStorage) lives in src/lib/csp-server.ts,
 * which only the server entry (src/server.ts) imports -- the registration
 * on `globalThis` (done by csp-server.ts when it's imported) is the only
 * bridge between the two.
 *
 * Real regression that motivated this split (08/04/2026, a few hours after
 * the previous version shipped): `node:async_hooks` doesn't exist in the
 * browser; a static `import { AsyncLocalStorage } from "node:async_hooks"`
 * in this file, even if never called on the client, already broke module
 * evaluation as soon as the client bundle loaded (Vite externalizes the
 * import, and accessing the stub's exported name throws immediately) --
 * it took down hydration for the entire application, not just CSP.
 *
 * On the client, `globalThis.__cspNonceStorage` is never defined
 * (csp-server.ts is never imported there), so getCspNonce() always
 * returns undefined -- correct, since the client doesn't need to know the
 * SSR response's nonce.
 */
export function getCspNonce(): string | undefined {
  return globalThis.__cspNonceStorage?.getStore();
}

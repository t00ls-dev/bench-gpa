/**
 * Named staleTime/gcTime for React Query's client-side queries.
 *
 * A separate axis from the server cache (CACHE_TTL_SHORT/LONG in
 * cache.ts): staleTime decides whether the BROWSER even asks again; the
 * server TTL decides, when it does ask, whether the response comes from
 * cache or hits the database. The values here are deliberately longer than
 * the corresponding server TTL (e.g. filter-bar asks for 10min staleTime
 * against 5min CACHE_TTL_LONG on the server): there's no need for the
 * client to ask again just because the server would already have a fresh
 * answer.
 *
 * Grouped by what invalidates the data, not by "how long seems
 * reasonable". The QueryClient default (router.tsx: staleTime 60s, gcTime
 * 10min) already covers the common case: the constants below only exist
 * for whoever needs a different value, with the reason alongside it.
 */

/** Admin audit log: the most "live" thing in the application. */
export const QUERY_STALE_LIVE = 15_000;

/** Admin operational panels (diagnostics, database health, heartbeats). */
export const QUERY_STALE_ADMIN = 30_000;

/**
 * Session identity and lightweight UI indicators (last sale in the
 * footer). Coincides with the QueryClient default (60s), kept explicit
 * because the reason it's 60s here is independent of the global default:
 * it's the "don't hit the server on every navigation" deadline described
 * in _authenticated/route.tsx: changing the global default shouldn't
 * change this by accident.
 */
export const QUERY_STALE_IDENTITY = 60_000;

/** Data that changes on every import: metrics, listings, analyses. */
export const QUERY_STALE_CORE = 5 * 60_000;

/** Reference/hierarchy data: only changes when the hierarchy changes. */
export const QUERY_STALE_REFERENCE = 10 * 60_000;

/**
 * gcTime for the "reference" tier: keeps the hierarchy/options in memory
 * longer than the QueryClient default (10min), since they rarely go stale.
 */
export const QUERY_GC_REFERENCE = 30 * 60_000;

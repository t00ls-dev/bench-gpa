/**
 * Data retention horizon, in days.
 *
 * `purge_old_aggs` deletes everything (aggs + import_log) with a
 * `sale_date` older than this. `import-watch` ignores files beyond this
 * horizon so it does NOT fall into an import->purge->reimport loop (an old
 * file in the current month's folder would get imported, the 3am purge
 * would remove it from import_log, and the next run would reimport it,
 * every day).
 *
 * Keeping purge and import-watch tied to this same constant is essential:
 * if retention ever changes, it only changes here.
 */
export const RETENTION_DAYS = 180;

/**
 * Purge cron schedule, for display in the admin heartbeats panel
 * (KNOWN_JOBS in admin-system.functions.ts).
 *
 * The real source of the schedule in production is HestiaCP's cron.conf
 * (v-add-cron-job "0" "3" "*" "*" "*"), not this file. See
 * scripts/setup-crons.sh, which documents this and must not run in
 * production. Bash/cron doesn't import TS, so there's no way for these two
 * ends to actually reference each other. When changing the cron time in
 * production, also change PURGE_CRON_LABEL here, otherwise the panel shows
 * a schedule that no longer matches reality.
 */
export const PURGE_CRON_LABEL = "diária, 03h";

/**
 * Deadline (hours) after the schedule before the purge heartbeat is
 * considered overdue: 24h for the daily interval + 2h of slack for
 * variation in the actual run time.
 */
export const PURGE_MAX_HOURS_OVERDUE = 26;

/**
 * refresh-universe cron schedule (product_universe/filter_hierarchy), for
 * display in the admin heartbeats panel, same caveat as PURGE_CRON_LABEL:
 * the real source is HestiaCP's cron.conf in production.
 *
 * Deliberately runs 30min after the purge (03h): that way it already sees
 * the post-purge agg in a single pass, instead of needing to run twice a
 * day. Until 07/30/2026 this refresh ran synchronously inside
 * finalize_import (every import) and purge_old_aggs (every purge that
 * removed a row): docs/continuar.md item 5: a new PLU/category now only
 * shows up in Área after this cron, not on the same day as the import.
 * Accepted because it's rare.
 */
export const REFRESH_UNIVERSE_CRON_LABEL = "diária, 03h30";

/**
 * Deadline (hours) after the schedule before the refresh-universe heartbeat
 * is considered overdue, same reasoning as PURGE_MAX_HOURS_OVERDUE.
 */
export const REFRESH_UNIVERSE_MAX_HOURS_OVERDUE = 26;

/**
 * Age of a `YYYY-MM-DD` date in UTC calendar days.
 *
 * Future dates return a negative value: the caller treats that as "within
 * retention", which is the correct behavior.
 */
export function daysSinceUtc(dateIso: string, now: number = Date.now()): number {
  return Math.floor((now - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * `true` when the purge PRESERVES this date (and, therefore, when
 * import-watch can import it without falling into the
 * import->purge->reimport loop).
 *
 * This function is the JS side of an invariant whose other end lives in
 * SQL, in `purge_old_aggs` (scripts/migrate-schema.sql):
 *
 *     DELETE ... WHERE sale_date < DATE_SUB(CURRENT_DATE, INTERVAL 180 DAY)
 *
 * Preserving `sale_date >= today - 180` is equivalent to
 * `daysSinceUtc(...) <= 180`. The purge's comparison is STRICT, so the
 * date exactly on the boundary (180 days) is kept, which is why this is
 * also `<=`, not `<`. Swapping either side for `<` reopens the daily
 * reimport loop.
 *
 * TIMEZONE DEPENDENCY: the two sides only agree because the server OS and
 * MariaDB are both on UTC (`time_zone = SYSTEM`, host TZ `Etc/UTC`) --
 * that's what makes `CURRENT_DATE` and the UTC day computed here the same
 * day. If the host's or the database's timezone changes to
 * `America/Sao_Paulo`, `CURRENT_DATE` starts rolling over 3h before the UTC
 * day and the boundary drifts by a day. When touching timezone config,
 * review this invariant along with it.
 */
export function isWithinRetention(dateIso: string, now: number = Date.now()): boolean {
  return daysSinceUtc(dateIso, now) <= RETENTION_DAYS;
}

import { describe, it, expect } from "vitest";
import { RETENTION_DAYS, daysSinceUtc, isWithinRetention } from "./retention";

// Fixed reference: 2026-07-23 20:00 UTC. Using a time in the middle of the
// day is deliberate: daysSinceUtc counts calendar days, so the result must
// not depend on what time the cron runs.
const NOW = Date.parse("2026-07-23T20:00:00Z");

/** Date that sits exactly `d` UTC calendar days before NOW. */
function daysAgo(d: number): string {
  return new Date(Date.parse("2026-07-23T00:00:00Z") - d * 86_400_000).toISOString().slice(0, 10);
}

describe("daysSinceUtc", () => {
  it("counts calendar days, not fractions", () => {
    expect(daysSinceUtc("2026-07-23", NOW)).toBe(0);
    expect(daysSinceUtc("2026-07-22", NOW)).toBe(1);
    expect(daysSinceUtc(daysAgo(180), NOW)).toBe(180);
  });

  it("does not depend on the time of day", () => {
    const earlyMorning = Date.parse("2026-07-23T00:30:00Z");
    const night = Date.parse("2026-07-23T23:45:00Z");
    expect(daysSinceUtc("2026-01-24", earlyMorning)).toBe(daysSinceUtc("2026-01-24", night));
  });

  it("returns negative for a future date", () => {
    expect(daysSinceUtc("2026-07-24", NOW)).toBeLessThan(0);
  });
});

describe("isWithinRetention: boundary matched with purge_old_aggs", () => {
  // The purge deletes `sale_date < CURRENT_DATE - RETENTION_DAYS` (strict),
  // so the date exactly on the boundary is PRESERVED. If this ever
  // becomes `<`, import-watch starts skipping a day the purge still keeps,
  // or, worse in the other direction, importing a day the purge deletes
  // overnight, reopening the import -> purge -> reimport loop.

  it("preserva a data exatamente na borda", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS), NOW)).toBe(true);
  });

  it("discards the first day past the boundary", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS + 1), NOW)).toBe(false);
  });

  it("keeps everything within the horizon", () => {
    expect(isWithinRetention(daysAgo(0), NOW)).toBe(true);
    expect(isWithinRetention(daysAgo(1), NOW)).toBe(true);
    expect(isWithinRetention(daysAgo(RETENTION_DAYS - 1), NOW)).toBe(true);
  });

  it("discards what's well past the horizon", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS + 30), NOW)).toBe(false);
    expect(isWithinRetention("2020-01-01", NOW)).toBe(false);
  });

  it("treats a future date as within retention", () => {
    expect(isWithinRetention("2026-12-31", NOW)).toBe(true);
  });

  it("no day exists where importing and purging disagree", () => {
    // Sweeps the neighborhood of the boundary: for every day, "import-watch
    // imports" has to be exactly "purge preserves". Purge preserves when
    // daysSinceUtc <= RETENTION_DAYS: the same math, written by hand here on
    // purpose, so the test fails if the implementation changes criteria.
    for (let d = RETENTION_DAYS - 5; d <= RETENTION_DAYS + 5; d++) {
      const date = daysAgo(d);
      const purgePreserves = daysSinceUtc(date, NOW) <= RETENTION_DAYS;
      expect(isWithinRetention(date, NOW)).toBe(purgePreserves);
    }
  });
});

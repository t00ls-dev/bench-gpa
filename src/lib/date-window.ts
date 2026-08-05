/**
 * Default date window screens open with.
 *
 * The `7` used to be written in two places (`filter-bar.tsx` and
 * `area.page.tsx`), and along with it the logic for slicing the last N
 * available dates, nearly identical in both, with a subtle difference only
 * noticeable comparing the files side by side. Here it becomes a single
 * function, following the `retention.ts` model: the constant and the
 * decision that depends on it live together.
 *
 * The value isn't cosmetic. Aggregating the entire detail table (~3M rows)
 * on every dashboard load took ~20s; the 7-day window keeps it under 1s.
 * The period picker still allows any range: this is just the starting point.
 *
 * Do NOT confuse this with the `7` in `shiftPeriod` (api-types.ts), which is
 * "days in a week" for the comparison period. Same number, different
 * concept: changing the default window must not affect the weekly
 * comparison.
 */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Last `DEFAULT_WINDOW_DAYS` dates with data, among the available ones.
 *
 * `available` must be in ascending order: that's the guarantee
 * `getFilterOptions`/`getAreaFilterHierarchy` establish by sorting at the
 * boundary (there's a long comment there explaining why: an old prod proc
 * returned DESC and produced an inverted range that loaded no data).
 *
 * `latest` caps the end of the window to the last imported date: the Área
 * screen uses this; the dashboard doesn't pass it and gets everything that
 * exists. Returns `null` when there's no date at all, leaving it to the
 * caller to decide what to do.
 */
export function defaultDateWindow(
  available: readonly string[],
  latest?: string | null,
): { from: string; to: string } | null {
  const upTo = latest ? available.filter((d) => d <= latest) : available;

  if (upTo.length === 0) {
    // No date at all up to the limit: the only possible slice is the limit
    // itself, if there is one. This is the edge case the Área screen
    // already handled.
    return latest ? { from: latest, to: latest } : null;
  }

  const win = upTo.slice(-DEFAULT_WINDOW_DAYS);
  return { from: win[0], to: latest ?? upTo[upTo.length - 1] };
}

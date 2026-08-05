/**
 * Coverage floors, single source for both Vitest and the summary generator.
 *
 * The two used to read the same object written twice: once in
 * `vitest.config.ts` (where it fails the build) and once in
 * `generate-coverage-summary.ts` (where it decides each report line's
 * status). The script itself admitted the duplication in a comment ("Kept
 * in sync with the coverage.thresholds block in vitest.config.ts"), which
 * already gave away that staying in sync depended on someone remembering.
 *
 * The symptom of forgetting wouldn't be an error, it would be a report
 * lying: a file marked ok while CI fails it for being below the real floor.
 *
 * These are FLOORS, not targets: they exist to prevent regression, not to
 * describe the desired coverage. Raising them only makes sense after real
 * coverage has gone up and stayed there, otherwise CI breaks for whoever
 * touched the code last, not for whoever actually dropped coverage.
 *
 * Recalibrated on 08/01/2026 (QA audit, item 2): `vitest.config.ts` started
 * including `.tsx` in `test.include`/`coverage.include`. Before that,
 * `*.test.tsx` was silently ignored (never ran, never errored), and
 * component/page coverage didn't even show up as 0% in the report. This
 * nearly doubled the denominator (117 source files vs. ~49 before) with
 * dozens of components still untested -- not a real coverage regression,
 * it's the report starting to honestly count what always existed. The old
 * floors (40/40/30/25) only measured `.ts`; the new ones keep the same
 * relative slack the old ones had against the real coverage of that time.
 */
export const COVERAGE_THRESHOLDS = {
  lines: 20,
  statements: 20,
  functions: 15,
  branches: 12,
};

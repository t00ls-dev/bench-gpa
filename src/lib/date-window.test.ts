import { describe, it, expect } from "vitest";
import { defaultDateWindow, DEFAULT_WINDOW_DAYS } from "./date-window";

const days = (n: number, start = 1) =>
  Array.from({ length: n }, (_, i) => `2026-07-${String(start + i).padStart(2, "0")}`);

describe("defaultDateWindow", () => {
  it("returns the last DEFAULT_WINDOW_DAYS dates when there are enough to spare", () => {
    const r = defaultDateWindow(days(20));
    expect(r).toEqual({ from: "2026-07-14", to: "2026-07-20" });
    expect(r && days(20).indexOf(r.to) - days(20).indexOf(r.from) + 1).toBe(DEFAULT_WINDOW_DAYS);
  });

  it("uses everything that exists when there are fewer dates than the window", () => {
    expect(defaultDateWindow(days(3))).toEqual({ from: "2026-07-01", to: "2026-07-03" });
  });

  it("a single day becomes a one-day window", () => {
    expect(defaultDateWindow(["2026-07-09"])).toEqual({ from: "2026-07-09", to: "2026-07-09" });
  });

  it("with no dates and no limit, returns null instead of a made-up interval", () => {
    expect(defaultDateWindow([])).toBeNull();
  });

  // The behavior the Área screen used to have: never go past the last imported date.
  describe("with a limit (latest)", () => {
    it("does not exceed the limit", () => {
      const r = defaultDateWindow(days(20), "2026-07-10");
      expect(r).toEqual({ from: "2026-07-04", to: "2026-07-10" });
    });

    it("ignores dates past the limit when building the window", () => {
      const r = defaultDateWindow(["2026-07-01", "2026-07-02", "2026-07-30"], "2026-07-02");
      expect(r).toEqual({ from: "2026-07-01", to: "2026-07-02" });
    });

    // Edge case that already existed on the screen: no available date is <= latest.
    it("falls back to the limit itself when nothing precedes it", () => {
      const r = defaultDateWindow(["2026-07-20", "2026-07-21"], "2026-07-01");
      expect(r).toEqual({ from: "2026-07-01", to: "2026-07-01" });
    });

    it("with no dates but with a limit, uses the limit on both sides", () => {
      expect(defaultDateWindow([], "2026-07-09")).toEqual({
        from: "2026-07-09",
        to: "2026-07-09",
      });
    });
  });

  it("the interval never comes out inverted (from <= to)", () => {
    const cases: [string[], string | undefined][] = [
      [days(20), undefined],
      [days(20), "2026-07-10"],
      [days(2), "2026-07-01"],
      [["2026-07-20"], "2026-07-01"],
    ];
    for (const [av, lt] of cases) {
      const r = defaultDateWindow(av, lt);
      if (r) expect(r.from <= r.to).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import { isPastOrToday } from "./target-date-picker";

describe("isPastOrToday", () => {
  const today = "2026-08-14";

  it("blocks today itself", () => {
    expect(isPastOrToday(new Date("2026-08-14T12:00:00"), today)).toBe(true);
  });

  it("blocks any date in the past", () => {
    expect(isPastOrToday(new Date("2026-08-13T12:00:00"), today)).toBe(true);
    expect(isPastOrToday(new Date("2026-01-01T12:00:00"), today)).toBe(true);
  });

  it("allows tomorrow and any date further in the future", () => {
    expect(isPastOrToday(new Date("2026-08-15T12:00:00"), today)).toBe(false);
    expect(isPastOrToday(new Date("2027-01-01T12:00:00"), today)).toBe(false);
  });
});

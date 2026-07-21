import { describe, it, expect } from "vitest";
import {
  shiftPeriod,
  parseNameVal,
  parseCodeNameVal,
  parseDateVal,
  asRecord,
  asArray,
  num,
  str,
  strOrNull,
  numOrNull,
} from "./api-types";

describe("shiftPeriod", () => {
  it("shifts by exact period length", () => {
    const r = shiftPeriod("2024-01-08", "2024-01-14", "prev_period");
    expect(r).toEqual({ dateFrom: "2024-01-01", dateTo: "2024-01-07" });
  });

  it("shifts by 7 days for prev_week", () => {
    const r = shiftPeriod("2024-01-15", "2024-01-21", "prev_week");
    expect(r).toEqual({ dateFrom: "2024-01-08", dateTo: "2024-01-14" });
  });

  it("shifts by 30 days for prev_month", () => {
    const r = shiftPeriod("2024-02-01", "2024-02-28", "prev_month");
    expect(r).toEqual({ dateFrom: "2024-01-02", dateTo: "2024-01-29" });
  });

  it("handles single day period", () => {
    const r = shiftPeriod("2024-06-15", "2024-06-15", "prev_period");
    expect(r).toEqual({ dateFrom: "2024-06-14", dateTo: "2024-06-14" });
  });
});

describe("parseNameVal", () => {
  it("parses valid array", () => {
    const input = [
      { name: "A", val: 100 },
      { name: "B", val: 200 },
    ];
    expect(parseNameVal(input)).toEqual([
      { name: "A", val: 100 },
      { name: "B", val: 200 },
    ]);
  });

  it("handles empty array", () => {
    expect(parseNameVal([])).toEqual([]);
  });

  it("handles null/undefined input", () => {
    expect(parseNameVal(null)).toEqual([]);
    expect(parseNameVal(undefined)).toEqual([]);
  });
});

describe("parseCodeNameVal", () => {
  it("parses valid array", () => {
    const input = [{ code: "C1", name: "A", val: 10 }];
    expect(parseCodeNameVal(input)).toEqual([{ code: "C1", name: "A", val: 10 }]);
  });

  it("handles empty input", () => {
    expect(parseCodeNameVal(null)).toEqual([]);
  });
});

describe("parseDateVal", () => {
  it("parses valid array", () => {
    const input = [{ date: "2024-01-01", val: 500 }];
    expect(parseDateVal(input)).toEqual([{ date: "2024-01-01", val: 500 }]);
  });
});

describe("asRecord", () => {
  it("returns object as-is", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it("returns empty object for non-object", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord("string")).toEqual({});
  });
});

describe("asArray", () => {
  it("returns array as-is", () => {
    const arr = [1, 2, 3];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns empty array for non-array", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray({})).toEqual([]);
  });
});

describe("num", () => {
  it("converts to number", () => {
    expect(num(42)).toBe(42);
    expect(num("42")).toBe(42);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
  });
});

describe("str", () => {
  it("converts to string", () => {
    expect(str("hello")).toBe("hello");
    expect(str(123)).toBe("123");
    expect(str(null)).toBe("");
  });
});

describe("strOrNull", () => {
  it("returns null for null/undefined", () => {
    expect(strOrNull(null)).toBeNull();
    expect(strOrNull(undefined)).toBeNull();
  });

  it("converts to string for values", () => {
    expect(strOrNull("hello")).toBe("hello");
    expect(strOrNull(123)).toBe("123");
  });
});

describe("numOrNull", () => {
  it("returns null for null/undefined", () => {
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull(undefined)).toBeNull();
  });

  it("converts to number for values", () => {
    expect(numOrNull(42)).toBe(42);
    expect(numOrNull("42")).toBe(42);
  });
});

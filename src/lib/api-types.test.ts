import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("./cache", () => ({
  cache: { wrap: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()) },
  // O mock precisa expor as constantes também: `callMetrics` passa
  // CACHE_TTL_SHORT explicitamente para o wrap desde que os TTLs deixaram de
  // ser literais soltos (antes esta chamada caía no default invisível).
  CACHE_TTL_SHORT: 60_000,
  CACHE_TTL_LONG: 300_000,
}));

import {
  parseNameVal,
  parseCodeNameVal,
  parseDateVal,
  asRecord,
  asArray,
  num,
  str,
  strOrNull,
  numOrNull,
  callMetrics,
} from "./api-types";
import db from "./db";

const mockQuery = db.query as ReturnType<typeof vi.fn>;

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

describe("callMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregated metrics from db CALL", async () => {
    mockQuery.mockResolvedValue([
      [
        [{ total: 1000 }],
        [
          { code: "S1", name: "Loja 1", val: 600 },
          { code: "S2", name: "Loja 2", val: 400 },
        ],
        [
          { name: "Depto A", val: 500 },
          { name: "Depto B", val: 500 },
        ],
        [
          { date: new Date("2024-01-01"), val: 300 },
          { date: new Date("2024-01-02"), val: 700 },
        ],
      ],
    ]);

    const result = await callMetrics({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
    } as never);

    expect(result.total).toBe(1000);
    expect(result.byStore).toHaveLength(2);
    expect(result.byStore[0]).toEqual({ code: "S1", name: "Loja 1", val: 600 });
    expect(result.byDepto).toHaveLength(2);
    expect(result.byDate).toHaveLength(2);
    expect(result.byDate[0].date).toBe("2024-01-01");
  });

  it("handles empty result sets", async () => {
    mockQuery.mockResolvedValue([[[], [], [], []]]);

    const result = await callMetrics({
      dateFrom: null,
      dateTo: null,
    } as never);

    expect(result.total).toBe(0);
    expect(result.byStore).toEqual([]);
    expect(result.byDepto).toEqual([]);
    expect(result.byDate).toEqual([]);
  });
});

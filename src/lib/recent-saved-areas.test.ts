import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecentSavedAreas,
  readRecentSavedAreas,
  recordRecentSavedAreaVisit,
  removeRecentSavedArea,
  type StorageLike,
} from "./recent-saved-areas";

const areaOneId = "550e8400-e29b-41d4-a716-446655440000";
const areaTwoId = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

function areaId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("recent saved areas", () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    storage = createStorage();
  });

  it("keeps the latest visit once and separates users", () => {
    recordRecentSavedAreaVisit(storage, "user-1", areaOneId, 1_000);
    recordRecentSavedAreaVisit(storage, "user-1", areaTwoId, 2_000);
    const visits = recordRecentSavedAreaVisit(storage, "user-1", areaOneId, 3_000);

    expect(visits).toEqual([
      { analysisId: areaOneId, visitedAt: new Date(3_000).toISOString() },
      { analysisId: areaTwoId, visitedAt: new Date(2_000).toISOString() },
    ]);
    expect(readRecentSavedAreas(storage, "user-2", 3_000)).toEqual([]);
  });

  it("limits history to ten entries", () => {
    for (let index = 0; index < 12; index += 1) {
      recordRecentSavedAreaVisit(storage, "user-1", areaId(index), index * 1_000);
    }

    const visits = readRecentSavedAreas(storage, "user-1", 12_000);
    expect(visits).toHaveLength(10);
    expect(visits[0]?.analysisId).toBe(areaId(11));
    expect(visits.at(-1)?.analysisId).toBe(areaId(2));
  });

  it("expires and physically removes visits older than thirty days", () => {
    recordRecentSavedAreaVisit(storage, "user-1", areaOneId, 1_000);
    const afterRetention = 1_000 + 30 * 24 * 60 * 60 * 1000 + 1;

    expect(readRecentSavedAreas(storage, "user-1", afterRetention)).toEqual([]);
    expect(storage.values.size).toBe(0);
  });

  it("discards future visits", () => {
    recordRecentSavedAreaVisit(storage, "user-1", areaOneId, 2_000);

    expect(readRecentSavedAreas(storage, "user-1", 1_000)).toEqual([]);
    expect(storage.values.size).toBe(0);
  });

  it("removes one visit or clears the complete history", () => {
    const now = Date.now();
    recordRecentSavedAreaVisit(storage, "user-1", areaOneId, now - 1);
    recordRecentSavedAreaVisit(storage, "user-1", areaTwoId, now);

    expect(removeRecentSavedArea(storage, "user-1", areaOneId)).toHaveLength(1);
    clearRecentSavedAreas(storage, "user-1");
    expect(readRecentSavedAreas(storage, "user-1")).toEqual([]);
  });

  it("discards invalid stored values", () => {
    storage.values.set(
      "bench-gpa:saved-areas:recent:user-1",
      JSON.stringify([{ analysisId: "invalid", visitedAt: new Date().toISOString() }]),
    );

    expect(readRecentSavedAreas(storage, "user-1")).toEqual([]);
    expect(storage.values.size).toBe(0);
  });

  it("does not interrupt the workflow when browser storage fails", () => {
    const failingStorage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readRecentSavedAreas(failingStorage, "user-1")).toEqual([]);
    expect(recordRecentSavedAreaVisit(failingStorage, "user-1", areaOneId)).toHaveLength(1);
    expect(removeRecentSavedArea(failingStorage, "user-1", areaOneId)).toEqual([]);
    expect(() => clearRecentSavedAreas(failingStorage, "user-1")).not.toThrow();
  });
});

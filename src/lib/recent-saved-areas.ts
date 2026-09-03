export interface RecentSavedAreaVisit {
  analysisId: string;
  visitedAt: string;
}

export const RECENT_SAVED_AREAS_LIMIT = 10;
export const RECENT_SAVED_AREAS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function getBrowserLocalStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(userId: string): string {
  return `bench-gpa:saved-areas:recent:${userId}`;
}

function removeStoredVisits(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Browser storage is optional and must not interrupt the area workflow.
  }
}

function writeStoredVisits(
  storage: StorageLike,
  key: string,
  visits: RecentSavedAreaVisit[],
): void {
  try {
    storage.setItem(key, JSON.stringify(visits));
  } catch {
    // Browser storage is optional and must not interrupt the area workflow.
  }
}

function validVisit(value: unknown): value is RecentSavedAreaVisit {
  if (!value || typeof value !== "object") return false;
  const visit = value as Record<string, unknown>;
  return (
    typeof visit.analysisId === "string" &&
    UUID_PATTERN.test(visit.analysisId) &&
    typeof visit.visitedAt === "string" &&
    Number.isFinite(Date.parse(visit.visitedAt))
  );
}

export function readRecentSavedAreas(
  storage: StorageLike,
  userId: string,
  now = Date.now(),
): RecentSavedAreaVisit[] {
  try {
    const key = storageKey(userId);
    const raw = storage.getItem(key);
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) {
      removeStoredVisits(storage, key);
      return [];
    }
    const visits = parsed
      .filter(validVisit)
      .filter((visit) => {
        const age = now - Date.parse(visit.visitedAt);
        return age >= 0 && age <= RECENT_SAVED_AREAS_RETENTION_MS;
      })
      .sort((left, right) => Date.parse(right.visitedAt) - Date.parse(left.visitedAt))
      .slice(0, RECENT_SAVED_AREAS_LIMIT);
    const serialized = JSON.stringify(visits);
    if (visits.length === 0) {
      if (raw !== null) removeStoredVisits(storage, key);
    } else if (serialized !== raw) {
      writeStoredVisits(storage, key, visits);
    }
    return visits;
  } catch {
    removeStoredVisits(storage, storageKey(userId));
    return [];
  }
}

export function recordRecentSavedAreaVisit(
  storage: StorageLike,
  userId: string,
  analysisId: string,
  now = Date.now(),
): RecentSavedAreaVisit[] {
  const visits = readRecentSavedAreas(storage, userId, now).filter(
    (visit) => visit.analysisId !== analysisId,
  );
  const next = [{ analysisId, visitedAt: new Date(now).toISOString() }, ...visits].slice(
    0,
    RECENT_SAVED_AREAS_LIMIT,
  );
  writeStoredVisits(storage, storageKey(userId), next);
  return next;
}

export function removeRecentSavedArea(
  storage: StorageLike,
  userId: string,
  analysisId: string,
): RecentSavedAreaVisit[] {
  const next = readRecentSavedAreas(storage, userId).filter(
    (visit) => visit.analysisId !== analysisId,
  );
  if (next.length === 0) removeStoredVisits(storage, storageKey(userId));
  else writeStoredVisits(storage, storageKey(userId), next);
  return next;
}

export function clearRecentSavedAreas(storage: StorageLike, userId: string): void {
  removeStoredVisits(storage, storageKey(userId));
}

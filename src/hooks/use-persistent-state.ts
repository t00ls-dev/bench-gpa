import { useEffect, useRef, useState } from "react";

/**
 * Like useState but persists the value to localStorage under `key`.
 * Falls back to `initial` when nothing is stored or storage is unavailable.
 * `sanitize` is called after restoring the value — useful to discard invalid persisted data.
 */
export function usePersistentState<T>(key: string, initial: T, sanitize?: (v: T) => T) {
  // Tracks whether sanitize() actually changed the value read from storage,
  // so the corrected value gets written back immediately instead of only on
  // the next unrelated state change (which could leave bad data on disk
  // indefinitely for a user who never triggers another update).
  const sanitizedOnLoad = useRef(false);

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // Shallow-merge stored object with defaults so fields added later
      // don't read back as `undefined` (e.g. when new array fields are introduced).
      const isMergeable =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        initial &&
        typeof initial === "object" &&
        !Array.isArray(initial);
      const merged = isMergeable
        ? ({ ...(initial as object), ...(parsed as object) } as T)
        : (parsed as T);
      if (!sanitize) return merged;
      const cleaned = sanitize(merged);
      if (JSON.stringify(cleaned) !== JSON.stringify(merged)) sanitizedOnLoad.current = true;
      return cleaned;
    } catch {
      return initial;
    }
  });

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (!sanitizedOnLoad.current) return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / unavailable
    }
  }, [key, value]);

  return [value, setValue] as const;
}

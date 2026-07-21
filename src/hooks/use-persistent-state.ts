import { useEffect, useRef, useState } from "react";

/**
 * Like useState but persists the value to localStorage under `key`.
 * Falls back to `initial` when nothing is stored or storage is unavailable.
 * `sanitize` is called after restoring the value — useful to discard invalid persisted data.
 */
export function usePersistentState<T>(key: string, initial: T, sanitize?: (v: T) => T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // Shallow-merge stored object with defaults so fields added later
      // don't read back as `undefined` (e.g. when new array fields are introduced).
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        initial &&
        typeof initial === "object" &&
        !Array.isArray(initial)
      ) {
        const merged = { ...(initial as object), ...(parsed as object) } as T;
        return sanitize ? sanitize(merged) : merged;
      }
      const result = parsed as T;
      return sanitize ? sanitize(result) : result;
    } catch {
      return initial;
    }
  });

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / unavailable
    }
  }, [key, value]);

  return [value, setValue] as const;
}

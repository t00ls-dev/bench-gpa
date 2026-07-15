import { useEffect, useRef, useState } from "react";

/**
 * Like useState but persists the value to localStorage under `key`.
 * Falls back to `initial` when nothing is stored or storage is unavailable.
 */
export function usePersistentState<T>(key: string, initial: T) {
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
        return { ...(initial as object), ...(parsed as object) } as T;
      }
      return parsed as T;
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

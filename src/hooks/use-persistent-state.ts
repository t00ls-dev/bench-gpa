import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Like useState but persists the value to localStorage under `key`.
 * Falls back to `initial` when nothing is stored or storage is unavailable.
 * `sanitize` is called after restoring the value: useful to discard invalid persisted data.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  sanitize?: (v: T) => T,
): [T, Dispatch<SetStateAction<T>>] {
  // The persisted value can only be read after mounting (window doesn't
  // exist during SSR), never in the useState initializer: an initializer
  // that resolves `initial` on the server and the localStorage value on the
  // client makes the first post-hydration render diverge from the HTML sent
  // by SSR (a React hydration error whenever the user already had something
  // saved). `hydrated` gates the persistence effect below until that first
  // load happens, otherwise it would write `initial` back and wipe out the
  // saved value before hydration's setState renders.
  const [state, setState] = useState<{ value: T; hydrated: boolean }>({
    value: initial,
    hydrated: false,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        // One-time localStorage load on mount, not state derived from
        // props: there's no way around a setState-in-effect to read a
        // synchronous external store that only exists after `window` does
        // (see the comment above the state declaration).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((s) => ({ ...s, hydrated: true }));
        return;
      }
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
      const cleaned = sanitize ? sanitize(merged) : merged;
      setState({ value: cleaned, hydrated: true });
    } catch {
      setState((s) => ({ ...s, hydrated: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state.value));
    } catch {
      // ignore quota / unavailable
    }
  }, [key, state.value, state.hydrated]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((updater) => {
    setState((s) => ({
      value: typeof updater === "function" ? (updater as (prev: T) => T)(s.value) : updater,
      hydrated: true,
    }));
  }, []);

  return [state.value, setValue];
}

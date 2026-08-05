import { useState } from "react";

/**
 * Calls `onChange` during render (not in an effect) whenever any item in
 * `deps` has changed since the last render — the pattern React itself
 * recommends for "adjusting state when a prop changes", without the extra
 * round-trip of a `useEffect` (which would cause a visible commit with the
 * stale state before correcting). Shallow per-item comparison, same as
 * `useEffect`'s deps array.
 */
export function useResetOnChange(deps: readonly unknown[], onChange: () => void): void {
  const [prev, setPrev] = useState(deps);
  const changed = deps.length !== prev.length || deps.some((d, i) => !Object.is(d, prev[i]));
  if (changed) {
    setPrev(deps);
    onChange();
  }
}

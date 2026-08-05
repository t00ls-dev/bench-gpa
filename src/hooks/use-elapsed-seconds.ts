import { useEffect, useState } from "react";
import { useResetOnChange } from "./use-reset-on-change";

export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useResetOnChange([active], () => {
    if (!active) setSeconds(0);
  });

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    // Resets before starting the count: part of the timer choreography that
    // the next line schedules, not state derived from a prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(0);
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

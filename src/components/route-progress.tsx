"use client";

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Thin progress bar at the top, signaling that a navigation is in
 * progress. Fed by the router's status. A small delay before it appears
 * avoids "flashing" on instant navigations.
 */
export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [progress, setProgress] = useState(0); // 0 = hidden
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (trickle.current) {
        clearInterval(trickle.current);
        trickle.current = null;
      }
    };

    if (pending) {
      clearAll();
      // Only shows if the navigation takes longer than ~80ms: instant ones don't even appear.
      timers.current.push(
        setTimeout(() => {
          setProgress(12);
          trickle.current = setInterval(() => {
            setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.15));
          }, 200);
        }, 80),
      );
    } else {
      clearAll();
      // Completes and disappears, only when it was actually visible. Stays
      // in the effect deliberately (can't be moved to render): it's part of
      // the imperative timer choreography that the next line schedules, not
      // state derived from a prop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress((p) => (p > 0 ? 100 : 0));
      timers.current.push(setTimeout(() => setProgress(0), 200));
    }

    return clearAll;
  }, [pending]);

  const visible = progress > 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-primary ease-out"
        style={{
          width: `${progress}%`,
          transition: progress === 0 ? "none" : "width 200ms ease-out",
          boxShadow: "0 0 8px var(--primary)",
        }}
      />
    </div>
  );
}

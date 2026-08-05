import { useEffect, useRef } from "react";

/**
 * Keeps the screen on while `active` is true (e.g. during a long import, so
 * the visual progress isn't lost and the screen doesn't turn off mid-upload
 * on something that can take minutes). Uses the native Screen Wake Lock
 * API; browsers without support (or outside a secure context, http without
 * TLS) simply do nothing — degrades gracefully, never breaks the import
 * flow itself.
 *
 * The API releases the lock on its own when the tab becomes hidden (app
 * switch, minimize, locked screen): that's the spec's documented behavior,
 * not a bug. The browser recommends reacquiring it on return if still
 * active, hence the visibilitychange listener.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        // The browser fires "release" both when we call sentinel.release()
        // and when it releases on its own (hidden tab) -- without listening
        // for this, lockRef.current would hold a stale reference and the
        // visibilitychange handler below would never reacquire the lock.
        sentinel.addEventListener("release", () => {
          if (lockRef.current === sentinel) lockRef.current = null;
        });
        lockRef.current = sentinel;
      } catch {
        // NotAllowedError (tab not visible at request time, permission
        // denied by the browser, etc.): the screen won't stay on, but the
        // import proceeds normally. Not an error worth interrupting anything for.
      }
    }

    acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}

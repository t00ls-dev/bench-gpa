import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBuildInfo } from "@/lib/version.functions";
import { getBrowserSessionStorage, isImportActive } from "@/lib/chunk-reload";

const CHECK_INTERVAL_MS = 15 * 60_000;

/**
 * Detects when the client is running a JS bundle older than what's deployed
 * on the server: happens because SPA route changes never reload the page,
 * so a tab left open (or, on mobile, backgrounded and resumed) across a
 * deploy keeps running stale code indefinitely, even after the bug it hit
 * has been fixed and shipped. Reloads automatically once detected, instead
 * of relying on the user to know to hard-refresh.
 *
 * Skipped only while an import is active: the multi-step client-driven
 * process would lose progress on an unexpected reload.
 */
export function useVersionCheck() {
  const fn = useServerFn(getBuildInfo);

  useEffect(() => {
    if (__COMMIT_HASH__ === "dev") return; // local dev build has no real hash to compare
    let cancelled = false;

    const check = async () => {
      if (isImportActive(getBrowserSessionStorage())) return;
      try {
        const info = await fn();
        if (!cancelled && info.commitHash !== __COMMIT_HASH__) {
          window.location.reload();
        }
      } catch {
        // network hiccup or logged out: ignore, next check will retry
      }
    };

    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(interval);
    };
  }, [fn]);
}

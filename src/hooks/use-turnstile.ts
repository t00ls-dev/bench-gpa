import { useEffect, useRef, useState } from "react";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const TURNSTILE_BYPASS = import.meta.env.VITE_TURNSTILE_BYPASS === "true";

type TurnstileWidget = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

function getTurnstile(): TurnstileWidget | undefined {
  return (window as unknown as { turnstile?: TurnstileWidget }).turnstile;
}

/**
 * Cloudflare Turnstile widget: injects the script, mounts it in the app's
 * fixed light theme, and exposes the current token. Extracted from
 * auth.page.tsx to be reused by first-access.page.tsx.
 */
export function useTurnstile() {
  const [token, setToken] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (TURNSTILE_BYPASS || !TURNSTILE_SITE_KEY) return;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (TURNSTILE_BYPASS) return;
    if (!TURNSTILE_SITE_KEY || !ref.current) return;

    let attempts = 0;
    const poll = setInterval(() => {
      const ts = getTurnstile();
      if (ts && ref.current) {
        clearInterval(poll);
        if (widgetIdRef.current) {
          ts.remove(widgetIdRef.current);
          setToken("");
        }
        widgetIdRef.current = ts.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      }
      if (++attempts > 100) clearInterval(poll);
    }, 100);

    return () => {
      clearInterval(poll);
      const ts = getTurnstile();
      if (widgetIdRef.current && ts) {
        ts.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, []);

  function reset(): void {
    setToken("");
    const ts = getTurnstile();
    if (ref.current && ts && widgetIdRef.current) {
      ts.reset(widgetIdRef.current);
    }
  }

  return { ref, token, reset, bypass: TURNSTILE_BYPASS };
}

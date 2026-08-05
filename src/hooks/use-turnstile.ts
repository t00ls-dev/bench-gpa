import { useEffect, useRef, useState } from "react";
import { useEffectiveTheme } from "@/hooks/use-theme";

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
 * Widget do Cloudflare Turnstile: injeta o script, monta/remonta honrando o
 * tema efetivo (a API não permite trocar o tema de um widget já montado) e
 * expõe o token atual. Extraído de auth.page.tsx para ser reusado por
 * first-access.page.tsx, que precisa exatamente do mesmo comportamento.
 */
export function useTurnstile() {
  const effectiveTheme = useEffectiveTheme();
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
          theme: effectiveTheme,
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
  }, [effectiveTheme]);

  function reset(): void {
    setToken("");
    const ts = getTurnstile();
    if (ref.current && ts && widgetIdRef.current) {
      ts.reset(widgetIdRef.current);
    }
  }

  return { ref, token, reset, bypass: TURNSTILE_BYPASS };
}
